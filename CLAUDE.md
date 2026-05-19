# CLAUDE.md | BY Weather Backend v1.1 Agent 指南

本文档给 AI Agent 和后续维护者提供项目地图。开始修改代码前，先读本文件，再按任务类型阅读 `doc/design/` 下的专题文档。

## 项目定位

**项目名称**：BY Weather Backend v1.1  
**应用类型**：无人机气象观测实时可视化单机 B/S 应用  
**核心目标**：把 Track、SCDP、ICFP、MWR 四类异步文件流汇聚成可追溯、可回放、可展示的统一飞行气象态势。

系统以 Track 飞行轨迹时间为主轴：

1. 后台轮询业务文件新增内容。
2. 按源文件格式解析为结构化记录。
3. 以 Track 时间对齐 SCDP、ICFP、MWR。
4. 写入内存历史窗口。
5. 通过 HTTP 查询和 WebSocket 实时推送给前端。
6. 前端以地图、粒子谱、微波辐射计廓线、饱和区和外部气象影像展示。

## 先读文档

- 总览：[doc/design/overview.md](./doc/design/overview.md)
- 数据链路：[doc/design/data-pipeline.md](./doc/design/data-pipeline.md)
- 后端接口：[doc/design/backend.md](./doc/design/backend.md)
- 前端说明：[doc/design/frontend.md](./doc/design/frontend.md)
- 运行发布：[doc/design/deployment.md](./doc/design/deployment.md)
- 决策记录：[DECISIONS.md](./DECISIONS.md)

## 技术栈

| 层级 | 技术/文件 | 说明 |
| --- | --- | --- |
| 后端服务 | FastAPI + Uvicorn | `app.py` 提供 HTTP API、WebSocket、静态资源 |
| 后台任务 | asyncio lifespan task | 服务启动后创建 `background_loop()` |
| 数据读取 | Python csv/pathlib 增量读取 | `readers.py` 维护 offset、partial、header 状态 |
| 数据缓存 | `OrderedDict` 内存窗口 | `store.py` 保存各源记录和对齐帧 |
| 实时推送 | FastAPI WebSocket | `publisher.py` 管理客户端并广播 JSON |
| 前端地图 | Leaflet | 轨迹、锚点、测距、离线/在线瓦片、雷达、Himawari |
| 前端图表 | ECharts | SCDP/ICFP/MWR 时序、粒子谱、廓线和饱和区 |
| 打包 | PyInstaller | `TEST_BYW.spec` 以 `launcher.py` 为入口 |

## 重要约定

1. `config.py` 是运行行为的单一配置入口。业务文件路径、轮询间隔、对齐窗口、地图图层、Himawari 配置都从这里来。
2. `launcher.py` 会设置 `BY_WEATHER_BASE_DIR`，打包态和开发态路径解析必须兼容这个环境变量。
3. 数据读取是增量模式，不应在后台循环里重复全量读取大文件。
4. Track 是对齐主轴。没有 Track 的时间点不生成 `AlignedFrame`。
5. SCDP 要求同秒匹配；ICFP 用向前查找窗口；MWR 用保持窗口。
6. WebSocket 推送的数据结构应与 `/api/latest`、`/api/history` 返回的对齐帧保持一致。
7. 前端当前是静态原生 HTML/CSS/JS，不引入构建链。
8. 业务模式下 `ALLOW_SIMULATED_FALLBACK = False`，不要让模拟数据悄悄替代真实业务输入。

## 修改建议

- 改数据源格式时，同时更新 `readers.py`、`doc/design/data-pipeline.md` 和必要的模拟数据。
- 改接口结构时，同时更新前端消费逻辑和 `doc/design/backend.md`。
- 改前端图表或地图状态时，优先保持现有 `state`、`dom`、`charts` 的组织方式。
- 改运行/打包方式时，同时检查 `launcher.py`、`TEST_BYW.spec` 和 `doc/design/deployment.md`。

## 常用命令

```bash
python launcher.py
python app.py
python -m uvicorn app:app --host 127.0.0.1 --port 8000
python smoke_test.py
python simulate_realtime.py
```
