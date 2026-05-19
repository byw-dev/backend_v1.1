# 决策记录 | BY Weather Backend v1.1

本文记录项目中影响架构、运行方式和数据语义的关键决策。新增重要变更时，优先追加新的 DEC 条目，而不是只把结论散落在代码里。

## DEC-001 | 单体 FastAPI + 静态前端

**决策**：使用一个 FastAPI 进程同时承载 API、WebSocket、前端静态文件和本地地图瓦片。

**原因**：项目面向单机部署和现场演示，减少服务数量可以降低部署复杂度。`launcher.py` 能统一处理运行目录、日志和浏览器启动。

**影响**：前后端耦合度较高，但发布包结构清晰；未来拆分前端构建链时需要保留 `/static`、`/tiles`、`/ws/realtime` 的兼容路径。

## DEC-002 | Track 作为对齐主轴

**决策**：只有 Track 记录出现的时间点才生成对齐帧。

**原因**：前端核心场景是飞行态势，气象探测数据需要依附飞行位置与时间解释。

**影响**：SCDP/ICFP/MWR 即使有独立数据，也不会单独形成前端帧；如果未来需要地面站独立时序，需要增加第二类时间轴。

## DEC-003 | 文件读取使用增量游标

**决策**：`readers.py` 对每个源文件维护 `offset`、`partial`、`header_done`、`column_map` 等状态，只读取追加内容。

**原因**：业务文件可能持续增长，全量读取会浪费 IO 并造成重复数据。

**影响**：需要处理文件截断/轮转；代码已在发现 offset 大于当前文件大小时重置游标。

## DEC-004 | ICFP 使用向前查找窗口

**决策**：ICFP 不要求与 Track 同秒，默认允许 `ICFP_LOOKBACK_SEC = 300` 秒内最近一条记录参与对齐。

**原因**：ICFP 采样和写入频率可能低于 Track，严格同秒会导致大量缺测。

**影响**：前端收到的 ICFP 模块会带 `source_time` 与 `age_sec`，用于判断数据年龄。

## DEC-005 | MWR 使用保持窗口

**决策**：MWR 默认在 `MWR_HOLD_SEC = 15` 秒内保持最近有效廓线。

**原因**：MWR 是廓线类数据，更新频率低于飞行轨迹；保持窗口能让飞行时间轴上有连续可读的剖面信息。

**影响**：MWR 状态可能是 `ok`、`partial`、`stale_hold` 或 `missing`。

## DEC-006 | MWR 饱和区算法内置化

**决策**：从 `reference/watervapor_saturated_zone.py` 中抽取 0-1 km 饱和区识别逻辑到 `mwr_saturation.py`。

**原因**：前端实时展示需要直接随对齐帧获得饱和区结果，不适合运行外部脚本。

**影响**：算法变更需要同时核对参考脚本和本文档；输出包含逐层分类、0/-5 摄氏度高度和连续区间。

## DEC-007 | 前端保持静态原生实现

**决策**：当前前端不引入 Vue/React/Vite，继续使用 `frontend/index.html`、`styles.css`、`app.js`。

**原因**：现场运行和 PyInstaller 打包更直接，减少 Node.js 依赖。

**影响**：`app.js` 体积较大，后续复杂度继续增长时应考虑模块化拆分。

## DEC-008 | 业务模式默认不回退模拟数据

**决策**：`ALLOW_SIMULATED_FALLBACK = False`。

**原因**：现场业务数据缺失时，应暴露问题，而不是误用模拟数据造成误判。

**影响**：开发演示时可手动改为 `True`，或直接运行 `simulate_realtime.py` 生成模拟输入。

## DEC-009 | 打包入口使用 launcher.py

**决策**：PyInstaller 以 `launcher.py` 为入口，而不是直接打包 `app.py`。

**原因**：启动器负责打包态运行目录、外部配置覆盖、日志 tee、自动打开浏览器，这些行为不应污染 FastAPI 主模块。

**影响**：发布目录必须携带 `frontend/`、`config.py`、`reference/`、`map_tiles/` 等运行资源。
