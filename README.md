# BY Weather Backend v1.1

BY Weather Backend v1.1 是一个面向无人机气象观测与飞行态势展示的单机 B/S 应用。系统持续读取 Track、SCDP、ICFP、MWR 四类业务数据文件，将异步数据按飞行时间轴对齐为统一的 `AlignedFrame`，再通过 HTTP API 与 WebSocket 推送给前端指挥界面。

项目同时提供地图态势、雷达/卫星叠加、粒子谱图表、微波辐射计廓线、水汽饱和区识别、回放、测距、锚点和区域边界等现场辅助功能。`launcher.py` 负责运行目录、日志、外部配置和浏览器启动；`app.py` 负责 FastAPI 服务、后台轮询、静态资源和地图/影像元数据；`frontend/` 是无构建链的 Leaflet + ECharts 前端。

## 文档入口

建议按下面顺序阅读：

1. [CLAUDE.md](./CLAUDE.md)：给 AI Agent 和维护者的项目总览、边界与协作约定。
2. [doc/design/overview.md](./doc/design/overview.md)：整体架构、模块职责和运行链路。
3. [doc/design/data-pipeline.md](./doc/design/data-pipeline.md)：数据源、增量读取、对齐策略和状态语义。
4. [doc/design/backend.md](./doc/design/backend.md)：FastAPI 生命周期、接口、WebSocket 和运行时路径。
5. [doc/design/frontend.md](./doc/design/frontend.md)：前端页面结构、地图图层、图表和交互状态。
6. [doc/design/deployment.md](./doc/design/deployment.md)：本地运行、模拟数据、日志、PyInstaller 打包和发布目录。
7. [PROJECT_FEATURES.md](./PROJECT_FEATURES.md)：当前功能实现清单。
8. [DECISIONS.md](./DECISIONS.md)：关键技术与业务决策记录。

## 快速运行

开发态直接启动：

```bash
python app.py
```

推荐使用启动器，获得与打包态一致的运行时目录、日志、外部配置加载和自动打开浏览器行为：

```bash
python launcher.py
```

默认访问：

- 页面：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

## 核心能力

- **实时数据接入**：增量读取 Track、SCDP、ICFP、MWR 四类业务文件，支持业务路径配置和模拟数据备用源。
- **多源时间对齐**：以 Track 为主时间轴，SCDP 同时刻匹配，ICFP 回看匹配，MWR 保持匹配，并支持历史帧回填。
- **MWR 饱和区识别**：计算 0-1000 m 温湿廓线相关水汽压、0 ℃ / -5 ℃ 高度和饱和区分类。
- **后端 API 与 WebSocket**：提供状态、最新帧、历史帧、地图配置、Himawari、本地云雷达、重点点位和实时推送接口。
- **地图态势**：Leaflet 展示航迹、当前飞机位置、离线/在线/卫星底图、固定点位、重点路径、探测半径和方位线。
- **雷达与卫星叠加**：支持 RainViewer 全球雷达、RainViewer 覆盖范围、Himawari-9 云图、本地云雷达 PPI/RPI。
- **本地云雷达**：从 `PPICMA` / `RPICMA` 目录读取 CMA/Z_RADA 径向基数据，按最新文件叠加到地图，PPI 在下层、RPI 在上层，带 dBZ 色标和扫描时间显示。
- **登录与权限分区**：支持内置账号、全量视图和精简视图。全量账号可查看全部图表和本地云雷达；精简账号使用接近 `backend_lite` 的大地图态势界面，并隐藏本地云雷达控件，后端 API 与 WebSocket 同步过滤 SCDP/ICFP/MWR 数据。
- **交互工具**：支持历史回放、地图点击选帧、测距、锚点、锚点表格和 TXT 导出、区域边界提示。
- **图表展示**：展示 SCDP/ICFP 时序和 bins，MWR 标量、温度/湿度/水汽密度/液态水廓线，以及饱和区热力图。

## 核心目录

```text
backend_v1.1/
  launcher.py             # 单机启动器：运行时目录、日志、外部 config、浏览器
  app.py                  # FastAPI 入口、后台轮询、HTTP API、WebSocket、静态资源
  config.py               # 业务文件路径、轮询/对齐参数、地图/雷达/影像配置
  models.py               # Track/SCDP/ICFP/MWR/AlignedFrame 数据模型
  readers.py              # 四类业务文件的增量读取、header 解析、记录构造
  aligner.py              # 以 Track 时间为主轴的数据对齐
  store.py                # 内存缓存、文件游标、历史窗口
  publisher.py            # WebSocket 连接管理与广播
  mwr_saturation.py       # MWR 0-1 km 水汽饱和区识别
  local_radar.py          # 本地云雷达 CMA/Z_RADA 读取和极坐标载荷构造
  simulate_realtime.py    # 模拟实时数据写入器
  smoke_test.py           # 基础冒烟测试
  get_radar/              # 雷达上传/试验脚本，含等经纬度格点化 demo
  frontend/               # 静态前端：index.html, styles.css, app.js
  reference/              # 重要点位、路径和参考算法
  simulated_data/         # 模拟实时数据与 bootstrap 样例
  map_tiles/              # 离线地图瓦片与瓦片工具
  logs/                   # launcher 运行日志
  doc/design/             # 架构设计文档
```

## 常用命令

```bash
# 启动完整应用
python launcher.py

# 仅启动 FastAPI
python -m uvicorn app:app --host 127.0.0.1 --port 8000

# 运行冒烟测试
python smoke_test.py

# 生成/追加模拟实时数据
python simulate_realtime.py

# 本地云雷达等经纬度格点化试验图
python get_radar/radar_latlon_grid_demo.py
```

## 配置重点

主要配置集中在 [config.py](./config.py)：

- `DATE1`、`DATE2`、`NUM`：业务日期和架次编号，Track/SCDP/ICFP/MWR 与本地云雷达路径都会使用这些日期变量。
- `TRACK_FILE`、`SCDP_FILE`、`ICFP_FILE`、`MWR_FILE`：业务数据输入文件。
- `ALLOW_SIMULATED_FALLBACK`：主业务文件缺失时是否允许回退到 `simulated_data/`。
- `POLL_INTERVAL_SEC`：后台业务数据轮询间隔。
- `ALIGN_DELAY_SEC`：Track 到达后等待其它源数据的对齐延迟。
- `MWR_HOLD_SEC`：MWR 最近有效廓线的保持窗口。
- `ICFP_LOOKBACK_SEC`：ICFP 向前查找窗口。
- `MAX_HISTORY_SECONDS`：内存历史窗口。
- `HOST`、`PORT`、`AUTO_OPEN_BROWSER`：运行地址与启动行为。
- `MAP_TILES_DIR`、`MAP_*_URL_TEMPLATE`：离线瓦片、在线 OSM 和在线卫星底图配置。
- `RAINVIEWER_*`：全球雷达图层刷新、色标和透明度参数。
- `HIMAWARI_*`：Himawari-9 云图时间、瓦片模板、产品和刷新参数。
- `LOCAL_RADAR_BASE_DIR`：本地云雷达根目录，当前按 `Path(r'D:/APP/radar_uploader_split/downloads') / DATE2` 组织。
- `LOCAL_RADAR_PRODUCTS`：本地云雷达产品列表，默认 `['PPI', 'RPI']`。
- `LOCAL_RADAR_REFRESH_SECONDS`：本地云雷达刷新/缓存间隔，当前默认 20 秒。
- `LOCAL_RADAR_LAT`、`LOCAL_RADAR_LON`、`LOCAL_RADAR_SITE_NAME`：本地云雷达站点位置和名称。
- `IMPORTANT_POINTS_FILE`：重点点位、重点路径、探测半径和方位线配置。
- `AUTH_ENABLED`、`AUTH_USERS`、`ROLE_PERMISSIONS`：登录开关、内置账号和角色权限配置。
- 页面“数据日期/架次”只做当前运行时临时切换，不写回 `config.py`；重启后仍使用上面的默认 `DATE1`、`DATE2`、`NUM`。

本地云雷达读取路径示例：

```text
D:\APP\radar_uploader_split\downloads\20260529\PPICMA
D:\APP\radar_uploader_split\downloads\20260529\RPICMA
```

## API 摘要

- `GET /`：返回前端页面。
- `GET /api/status`：返回缓存数量、最新时间、文件状态和运行参数。
- `GET /api/latest`：返回最新对齐帧。
- `GET /api/history?seconds=300`：返回最近窗口内的对齐帧列表。
- `GET /api/map-config`：返回底图、全球雷达、本地云雷达、Himawari 等地图配置。
- `GET /api/data-source`、`POST /api/data-source`：查看或临时切换当前运行时数据日期和架次，不持久化。
- `GET /api/himawari/latest`：返回最新 Himawari 图层元数据。
- `GET /api/local-radar/latest?product=PPI`：读取并返回最新本地云雷达 PPI/RPI 极坐标数据。
- `GET /api/important-points`：返回重点点位、重点路径、探测半径和方位线配置。
- `POST /api/login`、`POST /api/logout`、`GET /api/me`：登录、退出和当前账号权限。
- `WS /ws/realtime`：实时推送 `AlignedFrame`。

## 本地云雷达说明

本地云雷达使用 `local_radar.py` 读取 CMA/Z_RADA 径向基数据。前端不是使用瓦片，而是根据后端返回的方位角、距离和反射率矩阵，在 Leaflet 地图上绘制 Canvas 极坐标图层。

- 总开关关闭时不读取本地云雷达。
- 总开关开启后，按 PPI/RPI 勾选状态分别请求最新数据。
- 后端按文件名时间选择最新 `.zip` 文件。
- PPI 和 RPI 可同时叠加，PPI 在下层，RPI 在上层。
- 地图左下角显示读取到的扫描时间，格式为 `HH:mm`。
- 地图上显示 `dBZ` 色标，帮助判断回波强度。
- `get_radar/radar_latlon_grid_demo.py` 提供等经纬度格点化试验，当前包含 `nearest`、`polar_bilinear`、`barnes_like` 三种方法。

## 打包说明

当前 PyInstaller 入口为 [TEST_BYW.spec](./TEST_BYW.spec)，目标入口是 [launcher.py](./launcher.py)。打包产物位于 `dist/TEST_BYW/`，运行时会优先从可执行文件所在目录读取 `config.py`、`frontend/`、`map_tiles/`、`reference/`、`simulated_data/` 等资源。
