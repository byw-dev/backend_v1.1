# BY Weather Dashboard Backend v1.1

面向无人机观测任务的实时综合可视化后端与前端页面。系统以飞行轨迹时间为主时间轴，持续读取 Track、SCDP、ICFP、MWR 数据源，完成时间对齐后通过 HTTP API 与 WebSocket 推送给浏览器端展示。

## v1.1 主要功能

- 实时读取无人机轨迹、SCDP、ICFP、MWR 文件数据。
- 以轨迹时间为主轴做多源数据对齐，支持 MWR 数据短时保持补齐。
- 通过 WebSocket 实时推送已对齐帧，通过 HTTP API 查询状态、最新帧和历史帧。
- 前端仪表盘展示轨迹地图、粒子谱、时间序列、MWR 廓线和水汽饱和区热力图。
- 支持实时模式与历史回放模式，历史回放可播放、暂停、拖动时间滑条，并可点击轨迹点选中时刻。
- 地图支持本地瓦片、在线 OSM、卫星底图切换。
- 支持 RainViewer 雷达图层与覆盖范围图层，雷达图层按最新 frame path 替换更新。
- 支持重要点、固定航线/路径叠加，配置来自 `reference/important_points.json`。
- 地图显示当前/选中轨迹点的飞行高度、经纬度等信息。
- 地图窗口滚出主要视口后可切换为右下角小窗口，方便滚动查看其他图表时继续观察轨迹。
- 页面滚动、地图拖拽/缩放时会暂缓重渲染，降低卡顿。

## 目录结构

```text
backend_v1.1/
  app.py                  FastAPI 入口、API、WebSocket、静态文件服务
  config.py               数据源、轮询、地图、雷达等配置
  readers.py              Track/SCDP/ICFP/MWR 文件读取与解析
  aligner.py              多源数据按轨迹时间对齐
  store.py                内存历史数据存储
  publisher.py            WebSocket 连接管理
  mwr_saturation.py       MWR 饱和区识别
  simulate_realtime.py    实时数据模拟器
  smoke_test.py           数据读取与对齐冒烟测试
  frontend/               浏览器端页面、样式和可视化逻辑
  simulated_data/         模拟数据输出/回退数据目录
  reference/              重要点配置与参考算法
  map_tiles/              本地离线瓦片目录
```

## 运行

安装依赖后启动服务：

```bash
python app.py
```

默认地址：

- 页面：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

也可以直接使用 uvicorn：

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

## 数据源配置

主要配置集中在 `config.py`：

- `TRACK_FILE`：无人机轨迹文件。
- `SCDP_FILE`：SCDP 数据文件。
- `ICFP_FILE`：ICFP 数据文件。
- `MWR_FILE`：MWR 数据文件。
- `POLL_INTERVAL_SEC`：后台轮询间隔，当前为 `0.5s`。
- `ALIGN_DELAY_SEC`：轨迹数据到达后延迟对齐时间，当前为 `2s`。
- `MWR_HOLD_SEC`：MWR 允许保持时间，当前为 `15s`。
- `MAX_HISTORY_SECONDS`：内存历史帧上限，当前为 `3600s`。
- `ALLOW_SIMULATED_FALLBACK`：主数据文件缺失时是否允许回退到 `simulated_data/`。

轨迹字段按固定列读取，配置在 `TRACK_COLS`。MWR 只保留 `0-1000m` 高度层，配置在 `MWR_LEVELS_M`。

## 前端能力

前端位于 `frontend/`，由 `index.html`、`styles.css`、`app.js` 组成。

当前页面包含：

- 顶部连接状态、模式、最新时刻、日期和历史窗口提示。
- 历史窗口控制、实时/回放模式切换、回放播放/暂停、回放采样间隔和时间滑条。
- 地图底图选择、本地/在线/卫星切换。
- Radar 与 Coverage 图层开关、雷达透明度控制。
- 轨迹地图、当前轨迹点、选中轨迹点、采样回放点。
- SCDP/ICFP 滴谱柱状图和时间序列。
- MWR 单值量时间序列、温度/湿度/水汽密度/液态水廓线。
- MWR 水汽饱和区时间-高度热力图。

## 地图与雷达

地图底图配置：

- 本地瓦片目录：`map_tiles/{z}/{x}/{y}.png`
- 本地 URL：`/tiles/{z}/{x}/{y}.png`
- 在线 OSM：`MAP_ONLINE_URL_TEMPLATE`
- 卫星底图：`MAP_SATELLITE_URL_TEMPLATE`

RainViewer 雷达配置：

- 元数据 API：`RAINVIEWER_API_URL`
- 自动检查间隔：前端 `RAINVIEWER_API_REFRESH_MS`，当前为 `10min`
- 更新机制：请求 RainViewer 元数据，读取最新 `radar.past` 帧；若 `latestFrame.path` 变化，则移除旧雷达瓦片层并创建新的 Leaflet `tileLayer`。

## API

- `GET /`：返回前端页面。
- `GET /api/status`：运行状态、各数据源计数、最新对齐时间、文件状态。
- `GET /api/latest`：最新对齐帧。
- `GET /api/history?seconds=300`：最近 N 秒历史对齐帧，最大不超过 `MAX_HISTORY_SECONDS`。
- `GET /api/map-config`：前端地图、瓦片、RainViewer 配置。
- `GET /api/important-points`：重要点与固定路径配置。
- `WS /ws/realtime`：实时推送对齐后的帧数据。

## 测试与模拟

冒烟测试：

```bash
python smoke_test.py
```

实时模拟器：

```bash
python simulate_realtime.py
```

模拟器会根据 `config.py` 中的 `SOURCE_*` 与 `SIM_*` 配置向 `simulated_data/` 输出模拟实时文件。业务模式下默认 `ALLOW_SIMULATED_FALLBACK = False`，即主数据源缺失时不会自动使用模拟数据。

## 备注

- 当前存储为内存存储，服务重启后历史数据会清空。
- WebSocket 只负责服务端向浏览器推送，客户端消息仅用于保持连接。
- 页面中的图表渲染做了节流；回放模式下地图、图表、热力图使用不同刷新间隔以降低前端压力。
