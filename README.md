# BY Weather Backend v1.1

BY Weather Backend v1.1 是一个面向无人机气象观测与飞行态势展示的实时可视化项目。系统持续读取 Track、SCDP、ICFP、MWR 四类业务数据文件，将不同采样频率的数据按飞行时间轴对齐，缓存为统一的 `AlignedFrame`，再通过 HTTP API 与 WebSocket 推送给前端指挥界面。

本项目不是单纯后端服务，而是一个可独立运行和打包的单机 B/S 应用：`launcher.py` 负责运行时目录、日志、外部配置和浏览器启动；`app.py` 负责 FastAPI 服务、后台轮询任务、静态前端、地图瓦片与气象影像元数据；`frontend/` 中的静态页面负责 Leaflet 地图、ECharts 图表、回放、测距、锚点和雷达/卫星叠加。

## 文档入口

建议按下面顺序阅读：

1. [CLAUDE.md](./CLAUDE.md)：给 AI Agent 和维护者的项目总览、边界与协作约定。
2. [doc/design/overview.md](./doc/design/overview.md)：整体架构、模块职责和运行链路。
3. [doc/design/data-pipeline.md](./doc/design/data-pipeline.md)：数据源、增量读取、对齐策略和状态语义。
4. [doc/design/backend.md](./doc/design/backend.md)：FastAPI 生命周期、接口、WebSocket 和运行时路径。
5. [doc/design/frontend.md](./doc/design/frontend.md)：前端页面结构、地图图层、图表和交互状态。
6. [doc/design/deployment.md](./doc/design/deployment.md)：本地运行、模拟数据、日志、PyInstaller 打包和发布目录。
7. [DECISIONS.md](./DECISIONS.md)：关键技术与业务决策记录。

## 快速运行

开发态直接启动：

```bash
python app.py
```

或使用启动器，获得与打包态一致的运行时目录、日志和自动开浏览器行为：

```bash
python launcher.py
```

默认访问：

- 页面：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

## 核心目录

```text
backend_v1.1/
  launcher.py             # 单机启动器：运行时目录、日志、外部 config、浏览器
  app.py                  # FastAPI 入口、后台轮询、HTTP API、WebSocket、静态资源
  config.py               # 业务文件路径、轮询/对齐参数、地图/影像配置
  models.py               # Track/SCDP/ICFP/MWR/AlignedFrame 数据模型
  readers.py              # 四类文件的增量读取、header 解析、记录构造
  aligner.py              # 以 Track 时间为主轴的数据对齐
  store.py                # 内存缓存、文件游标、历史窗口
  publisher.py            # WebSocket 连接管理与广播
  mwr_saturation.py       # MWR 0-1 km 水汽饱和区识别
  simulate_realtime.py    # 模拟实时数据写入器
  smoke_test.py           # 基础冒烟测试
  frontend/               # 静态前端：index.html, styles.css, app.js
  reference/              # 重要点位、参考算法
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
```

## 配置重点

主要配置集中在 [config.py](./config.py)：

- `TRACK_FILE`、`SCDP_FILE`、`ICFP_FILE`、`MWR_FILE`：业务数据输入文件。
- `ALLOW_SIMULATED_FALLBACK`：主业务文件缺失时是否允许回退到 `simulated_data/`。
- `POLL_INTERVAL_SEC`：后台轮询间隔。
- `ALIGN_DELAY_SEC`：Track 到达后等待其它源数据的对齐延迟。
- `MWR_HOLD_SEC`：MWR 最近有效廓线的保持窗口。
- `ICFP_LOOKBACK_SEC`：ICFP 向前查找窗口。
- `MAX_HISTORY_SECONDS`：内存历史窗口。
- `HOST`、`PORT`、`AUTO_OPEN_BROWSER`：运行地址与启动行为。

## API 摘要

- `GET /`：返回前端页面。
- `GET /api/status`：返回缓存数量、最新时间、文件状态和运行参数。
- `GET /api/latest`：返回最新对齐帧。
- `GET /api/history?seconds=300`：返回最近窗口内的对齐帧列表。
- `GET /api/map-config`：返回地图瓦片、RainViewer、Himawari 配置。
- `GET /api/himawari/latest`：返回最新 Himawari 图层元数据。
- `GET /api/important-points`：返回重要点位和路径。
- `WS /ws/realtime`：实时推送 `AlignedFrame`。

## 打包说明

当前 PyInstaller 入口为 [TEST_BYW.spec](./TEST_BYW.spec)，目标入口是 [launcher.py](./launcher.py)。打包产物位于 `dist/TEST_BYW/`，运行时会优先从可执行文件所在目录读取 `config.py`、`frontend/`、`map_tiles/`、`reference/`、`simulated_data/` 等资源。
