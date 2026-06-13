# 后端设计 | BY Weather Backend v1.1

> 文档版本：1.0  
> 相关文件：`app.py`、`launcher.py`、`publisher.py`、`store.py`

## 应用入口

后端有两个入口：

| 入口 | 用途 |
| --- | --- |
| `python app.py` | 开发态直接启动 FastAPI。 |
| `python launcher.py` | 推荐入口，模拟打包态运行行为。 |

`launcher.py` 额外负责：

- 判断运行目录：源码态为项目目录，打包态为 exe 所在目录。
- `os.chdir(base_dir)`。
- 设置 `BY_WEATHER_BASE_DIR`。
- 将 stdout/stderr 同步写入 `logs/by_weather_YYYYMMDD.log`。
- 优先加载运行目录下的 `config.py`。
- 根据 `AUTO_OPEN_BROWSER` 延迟打开浏览器。

## FastAPI 生命周期

`app.py` 使用 `lifespan`：

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(background_loop())
    try:
        yield
    finally:
        task.cancel()
```

服务启动后后台任务持续轮询数据源；服务关闭时取消任务。

## 运行时路径

核心函数：

```python
def _runtime_base_dir() -> Path:
    return Path(os.environ.get("BY_WEATHER_BASE_DIR", Path(__file__).parent)).resolve()
```

相对路径都应通过运行时目录解析，保证源码态和打包态一致。

当前挂载：

- `frontend/` 存在时挂载到 `/static`。
- `map_tiles/` 存在时挂载到 `/tiles`。
- `/` 返回 `frontend/index.html`。
- `/login` 返回内置登录页；登录成功后通过 HTTP-only cookie 保存本地签名会话。

## 全局对象

```python
app = FastAPI(...)
store = InMemoryStore(max_history_seconds=MAX_HISTORY_SECONDS)
manager = ConnectionManager()
```

- `store` 是进程内唯一数据缓存。
- `manager` 是 WebSocket 客户端管理器。

## HTTP API

### GET `/`

返回 `frontend/index.html`。如果前端文件不存在，返回 JSON：

```json
{"message": "Frontend not found."}
```

### GET `/api/status`

返回运行状态：

- 各源缓存数量。
- aligned 缓存数量。
- 最新对齐时间。
- 最新 MWR 源时间、到达时间和到达延迟。
- `file_states`。
- 轮询参数和历史窗口。

用途：排查文件是否读取、header 是否识别、是否使用 fallback、数据是否正在增长。

权限语义：精简账号不会返回 `file_states`、各源缓存数量、MWR 到达延迟等排障细节，只返回最新时间、aligned 数量、轮询间隔和历史窗口。

### GET `/api/latest`

返回最新 `AlignedFrame`。如果尚未生成对齐帧，返回空对象 `{}`。

权限语义：精简账号的 `scdp`、`icfp`、`mwr` 模块会被替换为 `status = "hidden"` 和空数据，只保留地图/航迹展示需要的内容。

### GET `/api/history?seconds=300`

返回最近窗口内的对齐帧数组。请求值会被 `MAX_HISTORY_SECONDS` 截断。

注意：当前实现按最近 N 条对齐帧切片，不是严格按时间戳过滤。

权限语义同 `/api/latest`，历史帧会按当前账号角色逐帧过滤。

### GET `/api/map-config`

返回地图与气象图层配置：

- 离线瓦片是否存在。
- 本地/在线/卫星底图 URL 模板。
- Leaflet zoom 范围。
- RainViewer 参数。
- 本地云雷达目录可用性、PPI/RPI 产品列表、刷新间隔、默认透明度、最大探测半径和雷达站经纬度。
- Himawari 产品列表与刷新间隔。

### GET `/api/data-source`

返回当前运行时数据日期、`DATE2`、架次 `num`、默认日期/架次和四类业务文件路径。该接口反映本次进程内临时选择，不代表源码配置已被修改。

### POST `/api/data-source`

接收 `date1`（`YYYY-MM-DD`）和 `num`（正整数），在当前进程内临时切换 Track、SCDP、ICFP、MWR 数据路径，并清空后端内存缓存、文件游标、MWR pending 和本地云雷达缓存。

该接口不写入 `config.py`，也不写入外部配置文件；程序重启后仍使用 `config.py` 中的默认 `DATE1`、`DATE2`、`NUM`。

### GET `/api/local-radar/latest?product=PPI`

读取本地云雷达最新一帧数据，`product` 支持 `PPI`、`RPI`，默认使用 `LOCAL_RADAR_DEFAULT_PRODUCT`。

运行机制：

- 数据目录来自 `LOCAL_RADAR_BASE_DIR`，当前约定为 `LOCAL_RADAR_BASE_DIR / PPICMA` 和 `LOCAL_RADAR_BASE_DIR / RPICMA`。
- 后端扫描对应目录下的 `.zip` 文件，按文件名时间解析并选择最新文件。
- 使用 `local_radar.py` 读取 CMA/Z_RADA 径向基数据，默认提取 `LOCAL_RADAR_VARIABLE`，通常为 `Z2`。
- 返回雷达站经纬度、扫描时间、方位角、距离、反射率矩阵、统计量和绘制参数。
- 接口结果按 `LOCAL_RADAR_REFRESH_SECONDS` 做内存缓存，当前默认 20 秒；传入 `force=true` 时跳过缓存重新扫描/读取。

返回数据是极坐标绘制数据，不是瓦片，也不是历史序列。前端负责按地图投影绘制 Canvas 图层。

权限语义：仅具备 `view_local_radar` 权限的账号可访问；精简账号访问时返回 `403`。精简前端隐藏本地云雷达控件、状态控件和色标，且不会请求该接口。

### GET `/api/himawari/latest`

请求日本气象厅 Himawari targetTimes，选择最新 `base_time` 和 `valid_time`，并探测可用图片格式。

返回包含：

- `fd` 全圆盘图层。
- `jp` 日本区域图层。
- `products`。
- `refresh_seconds`。
- `attribution`。

结果在内存中按 `HIMAWARI_REFRESH_SECONDS` 缓存。

### GET `/api/important-points`

读取 `reference/important_points.json`，校验点位和路径结构，返回规范化结果与 warnings。

支持：

- `type_styles`
- `path_styles`
- `points`
- `paths`
- `coverage_radii_km`
- `coverage_color`
- `azimuth_sector_count`
- `azimuth_radius_km`
- `azimuth_start_deg`

### POST `/api/login`

校验 `config.AUTH_USERS` 中的内置账号，成功后写入签名会话 cookie。账号角色来自配置中的 `role` 字段。

### POST `/api/logout`

清除会话 cookie。

### GET `/api/me`

返回当前登录账号、角色和权限列表，前端据此切换完整界面或 lite 大地图界面。

## WebSocket

### WS `/ws/realtime`

客户端连接后进入被动接收模式。后台每生成或回填一个 `AlignedFrame`，按连接账号角色过滤后广播：

```python
await manager.broadcast(frame.to_dict(), prepare=_frame_for_user)
```

客户端断开或发送异常时，`ConnectionManager` 会移除连接。

## 错误处理

后台循环捕获普通异常并打印：

```python
print(f"[background_loop] error: {exc}")
```

这保证单次读取/对齐错误不会杀死服务。若通过 `launcher.py` 启动，错误会写入当天日志。

## 外部网络

后端会访问：

- `RAINVIEWER_API_URL`：由前端直接使用配置项，后端只下发。
- `HIMAWARI_FD_TARGET_TIMES_URL`
- `HIMAWARI_JP_TARGET_TIMES_URL`
- Himawari tile sample URL：用于探测图片格式。

现场离线运行时，应关闭或忽略相关图层，或提前准备可用缓存/网络策略。
