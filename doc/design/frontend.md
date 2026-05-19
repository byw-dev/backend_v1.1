# 前端设计 | BY Weather Backend v1.1

> 文档版本：1.0  
> 相关文件：`frontend/index.html`、`frontend/styles.css`、`frontend/app.js`

## 技术形态

前端是无构建链的静态页面：

- `index.html`：页面骨架。
- `styles.css`：指挥界面样式。
- `app.js`：状态、接口、地图、图表、交互逻辑。

第三方能力：

- Leaflet：地图、轨迹、瓦片、图层、测距、锚点。
- ECharts：时序图、粒子谱、廓线、饱和区。

## 页面结构

页面由三块组成：

| 区域 | 说明 |
| --- | --- |
| 顶部状态栏 | WebSocket 状态、模式、最新时间、日期、历史窗口。 |
| 左侧控制栏 | 时间窗口、回放、地图图层、雷达/卫星、测距、锚点、区域边界、粒子谱显示。 |
| 主工作区 | 中央地图与时序图，右侧 MWR/SCDP/ICFP 图表。 |

主要容器：

- `#track-map`
- `#scdp-series-chart`
- `#icfp-series-chart`
- `#mwr-saturated-zone-chart`
- `#mwr-scalar-chart`
- `#icfp-bins-chart`
- `#scdp-bins-chart`
- MWR 温度/湿度/水汽密度/液态水廓线图表。

## 前端状态

`app.js` 使用单一 `state` 对象维护运行状态。典型字段包括：

- WebSocket 连接状态。
- 最新对齐帧。
- 历史帧列表。
- 实时/回放模式。
- 回放索引和播放间隔。
- 地图配置。
- 雷达与 Himawari 图层状态。
- 重要点位与路径。
- 测距、锚点、区域边界。
- 图表显示开关。

DOM 引用集中在 `dom` 对象，图表实例集中在 `charts` 对象。

## 数据入口

前端启动时主要调用：

- `/api/map-config`
- `/api/history`
- `/api/latest`
- `/api/important-points`
- `/ws/realtime`

实时模式下，WebSocket 新帧会进入历史数组并刷新地图与图表。回放模式下，用户通过 slider 或播放按钮选取历史帧。

## 地图图层

Leaflet 地图包含：

| 图层 | 来源 |
| --- | --- |
| 飞行轨迹 | `AlignedFrame.track.data.lon/lat` |
| 当前飞机位置 | 最新或回放选中帧 |
| 离线瓦片 | `/tiles/{z}/{x}/{y}.png` |
| 在线 OSM | `MAP_ONLINE_URL_TEMPLATE` |
| 在线卫星底图 | `MAP_SATELLITE_URL_TEMPLATE` |
| RainViewer 雷达 | 前端根据 `/api/map-config` 获取参数后加载 |
| RainViewer coverage | 雷达覆盖范围辅助层 |
| Himawari | `/api/himawari/latest` 返回的 JMA tile 模板 |
| 重要点位/路径 | `/api/important-points` |
| 测距线 | 用户点击生成 |
| 锚点 | 用户点击生成 |
| 区域边界 | 用户输入经纬度边界生成 |

`app.js` 为 RainViewer、Himawari、重要路径等建立了独立 pane，便于控制层级和点击穿透。

## 图表

图表使用 ECharts，数据来自当前展示帧和历史帧。

| 图表 | 数据 |
| --- | --- |
| SCDP 时序 | 历史帧中 `scdp.data` 的数浓度、LWC、MVD、ED |
| ICFP 时序 | 历史帧中 `icfp.data` 的数浓度、LWC、MVD、ED |
| SCDP bins | 当前帧 `scdp.data.bins` |
| ICFP bins | 当前帧 `icfp.data.bins`，前端可限制展示数量 |
| MWR scalar | `sur_tem`、`sur_hum`、`cloud_base_km`、`vint_mm`、`lqint_mm` |
| MWR profiles | 温度、水汽密度、湿度、液态水廓线 |
| MWR saturated zone | `mwr.data.saturated_zone.zone_codes` 和区间信息 |

## 状态语义

前端必须尊重后端模块状态：

- `ok`：正常实时数据。
- `missing`：无可用数据，显示缺测或占位。
- `partial`：MWR 部分廓线齐全，需提示不完整。
- `stale_hold`：MWR 使用保持窗口内旧数据，需展示源时间或年龄。

## 前端维护建议

1. 新增后端字段时，先确认 `AlignedFrame.to_dict()` 输出，再更新前端解析。
2. 新增图层时，复用现有 pane 和开关模式，避免散落全局变量。
3. 新增图表时，把 DOM、chart 实例、渲染函数和 resize 逻辑一起补齐。
4. 保持静态前端无构建链，除非明确决定迁移到模块化框架。
