# 总体架构 | BY Weather Backend v1.1

> 文档版本：1.0  
> 适用范围：`backend_v1.1/`

## 项目目标

BY Weather Backend v1.1 面向无人机气象观测实时展示。项目把不同来源、不同频率、不同格式的业务数据转成统一时间轴上的飞行气象帧，并在前端提供实时监控、历史回放、地图图层、粒子谱图表、MWR 廓线和饱和区可视化。

## 系统边界

系统内部负责：

- 读取 Track、SCDP、ICFP、MWR 四类本地文件。
- 管理每个文件的增量读取游标。
- 解析为结构化记录。
- 将记录对齐为 `AlignedFrame`。
- 缓存最近一段历史。
- 对外提供 REST API 与 WebSocket。
- 提供静态前端、离线地图瓦片、重要点位文件。
- 获取 RainViewer 与 Himawari 的图层元数据。

系统外部依赖：

- 业务侧持续写入的数据文件。
- RainViewer 公共天气雷达接口。
- 日本气象厅 Himawari 图像接口。
- 可选的在线地图瓦片服务。

## 运行链路

```text
业务数据文件
  Track CSV
  SCDP CSV
  ICFP CSV
  MWR TXT
      |
      v
readers.py
  增量读取 -> header 识别 -> 字段解析 -> dataclass 记录
      |
      v
store.py
  track_store / scdp_store / icfp_store / mwr_store
      |
      v
aligner.py
  以 Track 时间为主轴生成 AlignedFrame
      |
      v
store.aligned_store
      |
      +--> HTTP: /api/latest, /api/history, /api/status
      |
      +--> WebSocket: /ws/realtime
      |
      v
frontend/
  Leaflet 地图 + ECharts 图表 + 回放/测距/锚点/图层控制
```

## 后端模块

| 文件 | 职责 |
| --- | --- |
| `launcher.py` | 运行时入口。设置工作目录、环境变量、日志、外部配置、浏览器启动，并运行 Uvicorn。 |
| `app.py` | FastAPI 应用。创建后台轮询任务，提供 API/WebSocket/静态文件/图层元数据。 |
| `config.py` | 数据路径、采样参数、地图/雷达/卫星配置、网络配置。 |
| `models.py` | 业务记录和对齐帧 dataclass。 |
| `readers.py` | 增量读取文件并解析 Track/SCDP/ICFP/MWR。 |
| `aligner.py` | 按时间窗将多源数据对齐。 |
| `store.py` | 使用 `OrderedDict` 维护内存缓存、文件读取状态、pending MWR 分组。 |
| `publisher.py` | 管理 WebSocket 客户端并广播 JSON。 |
| `mwr_saturation.py` | 识别 MWR 温湿廓线中的水汽饱和区。 |
| `simulate_realtime.py` | 从源文件或 bootstrap 样例生成模拟实时文件。 |
| `smoke_test.py` | 快速验证基础数据读取与对齐流程。 |

## 前端模块

| 文件 | 职责 |
| --- | --- |
| `frontend/index.html` | 页面结构、控制栏、地图容器、图表容器、弹窗容器。 |
| `frontend/styles.css` | 指挥界面视觉样式与响应式布局。 |
| `frontend/app.js` | 状态管理、API/WebSocket、Leaflet 图层、ECharts 图表、回放和交互工具。 |

## 数据模型概念

`AlignedFrame` 是前后端之间最重要的数据合同：

```json
{
  "time": "2026-05-17T10:00:00",
  "track": {"status": "ok", "data": {"lon": 0, "lat": 0, "alt_m": 0}},
  "scdp": {"status": "ok|missing", "data": {}},
  "icfp": {"status": "ok|missing", "data": {}, "source_time": "...", "age_sec": 0},
  "mwr": {"status": "ok|partial|stale_hold|missing", "data": {}, "source_time": "...", "age_sec": 0}
}
```

每个模块都有 `status`，前端应根据状态判断是否展示真实数据、保持数据或缺测占位。

## 运行时路径

`app.py` 使用 `BY_WEATHER_BASE_DIR` 解析相对路径。开发态默认是项目目录；打包态由 `launcher.py` 设置为可执行文件所在目录。

这一点影响：

- `frontend/` 静态页面。
- `map_tiles/` 离线瓦片。
- `reference/important_points.json`。
- `simulated_data/` 回退数据。
- 外部 `config.py`。

## 可追溯原则

1. 文件来源在 `config.py` 中可查。
2. 每个源文件的读取状态在 `/api/status` 中可查。
3. 每个对齐帧包含模块状态、源时间和数据年龄。
4. 重要架构选择记录在 [DECISIONS.md](../../DECISIONS.md)。
5. 运行日志由 `launcher.py` 写入 `logs/by_weather_YYYYMMDD.log`。
