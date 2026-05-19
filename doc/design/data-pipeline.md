# 数据管线 | BY Weather Backend v1.1

> 文档版本：1.0  
> 相关文件：`config.py`、`readers.py`、`store.py`、`aligner.py`、`models.py`

## 数据源

系统读取四类业务数据：

| 数据源 | 配置项 | 记录类型 | 作用 |
| --- | --- | --- | --- |
| Track | `TRACK_FILE` | `TrackRecord` | 飞行轨迹主时间轴，提供经纬度、高度、速度、航向。 |
| SCDP | `SCDP_FILE` | `ScdpRecord` | 云滴谱数据，包含数浓度、LWC、MVD、ED 和 30 个 bin。 |
| ICFP | `ICFP_FILE` | `IcfpRecord` | 冰晶/粒子谱数据，包含数浓度、LWC、MVD、ED 和 195 个 bin。 |
| MWR | `MWR_FILE` | `MwrRecord` | 微波辐射计廓线，包含地面量、云底、积分量和 0-1 km 廓线。 |

模拟数据位于 `simulated_data/`。当 `ALLOW_SIMULATED_FALLBACK = True` 且主文件缺失时，读取器会回退到：

- `simulated_data/track_realtime.csv`
- `simulated_data/scdp_realtime.csv`
- `simulated_data/icfp_realtime.csv`
- `simulated_data/mwr_realtime.txt`

业务模式默认不启用回退。

## 增量读取

`readers.py` 为每个源维护独立状态：

```python
{
    "offset": 0,
    "partial": "",
    "header_done": False,
    "column_map": None,
    "path_exists": True
}
```

读取策略：

1. 从上次 `offset` 继续读取新增内容。
2. 如果最后一行没有换行，放入 `partial`，等待下次补全。
3. SCDP/ICFP/MWR 先识别 header 并建立 `column_map`。
4. 文件被截断或轮转时，检测到 `offset > file_size` 后重置游标。
5. 文件不存在时记录 `path_exists = False`，并在 `/api/status` 暴露状态。

## 字段解析

### Track

Track 使用固定列映射，配置在 `TRACK_COLS`：

```python
TRACK_COLS = {
    "date": 2,
    "time": 3,
    "lon": 4,
    "lat": 5,
    "alt": 6,
    "speed": 13,
    "heading": 14,
}
```

时间格式为 `YYYYMMDD HH:MM:SS`。

### SCDP

SCDP header 由文件内容确定，关键字段：

- `Times`
- `Number Conc (#/cm^3)`
- `LWC (g/m^3)`
- `MVD (um)`
- `ED (um)`
- `CDP Bin 1` 到 `CDP Bin 30`

时间格式为 `YYYY/MM/DD HH:MM:SS`。

### ICFP

ICFP header 由文件内容确定，关键字段：

- `Time`
- `Number Conc(#/cm^3)`
- `LWC(g/m^3)`
- `MVD(um)`
- `ED(um)`
- `Bin1` 到 `Bin195`

时间格式为 `YYYY-MM-DD-HH:MM:SS`。

### MWR

MWR 以 `DateTime` 和第三列 `type` 区分廓线类型：

| type | 说明 | 输出字段 |
| --- | --- | --- |
| `11` | 温度廓线 | `temperature_profile` |
| `12` | 水汽密度廓线 | `vapor_density_profile` |
| `13` | 相对湿度廓线 | `humidity_profile` |
| `14` | 液态水廓线 | `liquid_water_profile` |

同一时间点的四类廓线先进入 `store.mwr_pending`。当四类齐全时生成 `MwrRecord`；后台轮询末尾会把未齐全的 pending 组刷出为 `partial`。

MWR 保留高度层由 `MWR_LEVELS_M` 控制，当前为 0-1000 m。

## 对齐策略

`aligner.py` 的主函数是 `align_one_time(t, store, ...)`。

| 模块 | 对齐规则 | 缺测语义 |
| --- | --- | --- |
| Track | 必须存在，且时间 `t` 来自 Track。 | 没有 Track 不生成帧。 |
| SCDP | 与 Track 同一时间戳精确匹配。 | 无匹配时 `status = "missing"`。 |
| ICFP | 查找 `t` 之前最近记录，年龄不超过 `ICFP_LOOKBACK_SEC`。 | 无有效记录时 `status = "missing"`。 |
| MWR | 查找 `t` 之前最近记录，年龄不超过 `MWR_HOLD_SEC`。 | 无有效记录时 `status = "missing"`。 |

MWR 状态：

- `ok`：源记录完整且与 Track 同时刻。
- `partial`：源记录缺少某些廓线类型，且与 Track 同时刻。
- `stale_hold`：使用保持窗口内的旧 MWR 记录。
- `missing`：窗口内没有可用记录。

ICFP 和 MWR 对齐结果都带有：

- `source_time`：实际使用的源数据时间。
- `age_sec`：相对 Track 时间的年龄。

## 后台循环

`app.py` 中 `background_loop()` 的主要步骤：

1. `poll_all_sources(store)` 读取新增源数据。
2. ICFP/MWR 新记录到达时，对已有 aligned frame 做回填候选。
3. 对到达时间超过 `ALIGN_DELAY_SEC` 的 Track 记录执行首次对齐。
4. 对齐成功后写入 `store.aligned_store`。
5. 通过 WebSocket 广播 `frame.to_dict()`。
6. 等待 `POLL_INTERVAL_SEC` 后继续。

`ALIGN_DELAY_SEC` 的作用是给其它源文件一点写入时间，减少 Track 刚到就立即缺测的情况。

## 历史窗口

`InMemoryStore` 使用 `OrderedDict` 保存历史。`MAX_HISTORY_SECONDS` 当前被用作最大记录数上限，而不是严格按 wall-clock 秒清理。

相关缓存：

- `track_store`
- `scdp_store`
- `icfp_store`
- `mwr_store`
- `aligned_store`

`/api/history?seconds=300` 当前按最近 N 条对齐帧返回，并用 `MAX_HISTORY_SECONDS` 截断请求值。

## 数据质量与可追溯

可追溯字段集中在：

- `/api/status.file_states`：每个文件是否存在、游标、header 状态、当前数据源。
- `AlignedFrame.*.status`：模块级状态。
- `AlignedFrame.*.source_time`：ICFP/MWR 实际源时间。
- `AlignedFrame.*.age_sec`：数据年龄。
- `logs/by_weather_YYYYMMDD.log`：运行日志。
