# backend_v1

第一版可运行后端，目标是：

- 只读增量读取四类文件
- 以飞机轨迹为主时间轴
- SCDP / ICFP 按秒精确匹配
- 微波辐射计按最近过去 15 秒保持显示
- 通过 HTTP 和 WebSocket 对外提供结果

## 启动方式

在目录内运行：

```bash
cd /mnt/data/backend_v1
python app.py
```

默认启动在：

- http://127.0.0.1:8000
- 文档：http://127.0.0.1:8000/docs

## 接口

- `GET /api/status`
- `GET /api/latest`
- `GET /api/history?seconds=300`
- `WS /ws/realtime`

## 说明

1. 第一版不接数据库，只用内存缓存。
2. 第一版保留了 SCDP 30 个 bin 和 ICFP 195 个 bin，但当前实时输出不返回它们。
3. 微波辐射计只保留 0-1 km 高度层数据。
4. 当前读取逻辑适配的是这次会话里上传的四个文件格式。
