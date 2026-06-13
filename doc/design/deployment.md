# 运行与发布 | BY Weather Backend v1.1

> 文档版本：1.0  
> 相关文件：`environment.yml`、`launcher.py`、`config.py`、`TEST_BYW.spec`

## 包管理理念

**Conda 环境、Python 3.9、单机 B/S、发布目录可直接运行**。

项目以 [environment.yml](../../environment.yml) 作为 Python 包管理入口，默认环境名为 `py3.9`。开发机、现场机和打包机应尽量使用同一份 Conda 环境文件恢复依赖，避免依赖隐藏在个人 base 环境中。

当前环境覆盖三类依赖：

- Web 服务运行：`fastapi`、`uvicorn`、`requests`。
- 数据处理与本地云雷达：`numpy`、`scipy`、`pandas`、`xarray`。
- 试验脚本与发布打包：`matplotlib`、`paramiko`、`pyinstaller`。

首次创建环境：

```bash
conda env create -f environment.yml
conda activate py3.9
```

已有环境更新：

```bash
conda env update -n py3.9 -f environment.yml --prune
conda activate py3.9
```

从当前环境回写依赖清单时，优先人工维护 `environment.yml` 中的顶层依赖；如需完整锁定现场环境，可另行导出完整快照：

```bash
conda env export -n py3.9 > environment.lock.yml
```

`environment.lock.yml` 适合现场留档，不建议替代 `environment.yml` 作为日常维护入口。

## 开发运行

推荐使用启动器：

```bash
conda activate py3.9
python launcher.py
```

直接运行 FastAPI：

```bash
conda activate py3.9
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

默认地址：

- 页面：`http://127.0.0.1:8000`
- OpenAPI：`http://127.0.0.1:8000/docs`

## 启动器行为

`launcher.py` 做了比 `app.py` 更多的运行时准备：

1. 判断 `base_dir`。
2. 切换当前工作目录到 `base_dir`。
3. 设置 `BY_WEATHER_BASE_DIR`。
4. 把 `base_dir` 放入 `sys.path`。
5. 创建 `logs/`。
6. 将 stdout/stderr 同步写入 `logs/by_weather_YYYYMMDD.log`。
7. 加载运行目录下的 `config.py`。
8. 启动 Uvicorn。
9. 根据配置自动打开浏览器。

因此发布态和现场使用应优先启动 `launcher.py` 或其打包 exe。

## 配置

运行配置位于 `config.py`。发布目录中的 `config.py` 可以覆盖打包内默认配置。

重点配置：

```python
HOST = "127.0.0.1"
PORT = 8000
AUTO_OPEN_BROWSER = True

ALLOW_SIMULATED_FALLBACK = False
POLL_INTERVAL_SEC = 0.5
ALIGN_DELAY_SEC = 2.0
MWR_HOLD_SEC = 15
ICFP_LOOKBACK_SEC = 300
MAX_HISTORY_SECONDS = 3600
```

业务文件路径：

```python
TRACK_FILE = Path(...)
SCDP_FILE = Path(...)
ICFP_FILE = Path(...)
MWR_FILE = Path(...)
```

## 模拟数据

运行模拟器：

```bash
python simulate_realtime.py
```

模拟器会向 `simulated_data/` 中的实时文件追加数据。开发联调时可以把 `ALLOW_SIMULATED_FALLBACK` 改为 `True`，让主业务文件缺失时自动读取模拟文件。

业务验收或现场运行建议保持：

```python
ALLOW_SIMULATED_FALLBACK = False
```

## 日志

通过 `launcher.py` 启动时，日志写入：

```text
logs/by_weather_YYYYMMDD.log
```

日志包含：

- 启动目录。
- 加载的配置文件。
- 服务地址。
- 后台读取/对齐异常。
- 文件缺失警告。

## 静态资源

运行目录应包含：

```text
frontend/
  index.html
  styles.css
  app.js

reference/
  important_points.json
  watervapor_saturated_zone.py

map_tiles/
  {z}/{x}/{y}.png
```

`map_tiles/` 不存在时，系统仍可运行，但 `/api/map-config` 会返回 `has_local_tiles = false`。

## PyInstaller 打包

当前 spec 文件为：

```text
TEST_BYW.spec
```

入口：

```python
Analysis(["launcher.py"], ...)
```

构建后产物位于：

```text
dist/TEST_BYW/
```

发布时建议确认目录中至少包含：

```text
TEST_BYW.exe
config.py
frontend/
reference/
simulated_data/
map_tiles/
logs/
```

如需把资源自动纳入 PyInstaller，可后续补充 `datas` 配置；当前已有 `dist/TEST_BYW/` 目录显示资源是以发布目录方式携带。

## 冒烟验证

```bash
python smoke_test.py
```

运行后检查：

1. `/api/status` 是否能看到文件状态。
2. `/api/latest` 是否生成对齐帧。
3. WebSocket 状态是否连接。
4. 地图是否加载底图或离线瓦片。
5. SCDP/ICFP/MWR 图表是否随数据刷新。

## 常见问题

### 页面能打开但没有数据

检查：

- `config.py` 中业务文件路径是否存在。
- `ALLOW_SIMULATED_FALLBACK` 是否符合预期。
- `/api/status.file_states` 中 `path_exists`、`header_done`、`active_source`。
- 日志中是否有 header 不匹配或文件缺失。

### MWR 一直 partial

MWR 同一时间需要 `type` 为 `11`、`12`、`13`、`14` 的四组廓线。缺少任一组会生成 partial。

### Himawari 图层不可用

检查外网连接、日本气象厅接口可达性，以及 `/api/himawari/latest` 返回中的 `error` 字段。

### 打包后找不到前端

确认 exe 所在目录下有 `frontend/index.html`，且通过 `launcher.py` 启动时 `BY_WEATHER_BASE_DIR` 指向该目录。
