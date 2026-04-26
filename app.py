import asyncio
import json
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from aligner import align_one_time
from config import (
    ALIGN_DELAY_SEC,
    HOST,
    MAP_ATTRIBUTION,
    MAP_LOCAL_URL_TEMPLATE,
    MAP_MAX_ZOOM,
    MAP_MIN_ZOOM,
    MAP_ONLINE_URL_TEMPLATE,
    MAP_SATELLITE_ATTRIBUTION,
    MAP_SATELLITE_URL_TEMPLATE,
    MAP_TILES_DIR,
    IMPORTANT_POINTS_FILE,
    MAX_HISTORY_SECONDS,
    MWR_HOLD_SEC,
    POLL_INTERVAL_SEC,
    PORT,
)
from publisher import ConnectionManager
from readers import poll_all_sources
from store import InMemoryStore


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(background_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

app = FastAPI(title='Aircraft Realtime Visualization Backend v1', lifespan=lifespan)
store = InMemoryStore(max_history_seconds=MAX_HISTORY_SECONDS)
manager = ConnectionManager()
frontend_dir = Path(__file__).parent / 'frontend'
tiles_dir = MAP_TILES_DIR

if frontend_dir.exists():
    app.mount('/static', StaticFiles(directory=frontend_dir), name='static')
if tiles_dir.exists():
    app.mount('/tiles', StaticFiles(directory=tiles_dir), name='tiles')


def _parse_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_important_points():
    payload = {
        'version': 1,
        'type_styles': {},
        'path_styles': {},
        'points': [],
        'paths': [],
        'warnings': [],
    }
    source_path = IMPORTANT_POINTS_FILE
    payload['source_file'] = str(source_path)

    if not source_path.exists():
        payload['warnings'].append(f'file_not_found: {source_path}')
        return payload

    try:
        raw = json.loads(source_path.read_text(encoding='utf-8'))
    except Exception as exc:
        payload['warnings'].append(f'json_parse_error: {exc}')
        return payload

    if isinstance(raw, dict):
        payload['version'] = raw.get('version', 1)
        type_styles = raw.get('type_styles', {})
        payload['type_styles'] = type_styles if isinstance(type_styles, dict) else {}
        path_styles = raw.get('path_styles', {})
        payload['path_styles'] = path_styles if isinstance(path_styles, dict) else {}
        raw_points = raw.get('points', [])
        raw_paths = raw.get('paths', [])
    else:
        payload['warnings'].append('invalid_root: expected object')
        return payload

    if not isinstance(raw_points, list):
        payload['warnings'].append('invalid_points: expected array')
        return payload
    if not isinstance(raw_paths, list):
        payload['warnings'].append('invalid_paths: expected array')
        raw_paths = []

    normalized_points = []
    for index, item in enumerate(raw_points):
        if not isinstance(item, dict):
            payload['warnings'].append(f'point[{index}] invalid: expected object')
            continue
        lat = _parse_float(item.get('lat'))
        lon = _parse_float(item.get('lon'))
        if lat is None or lon is None:
            payload['warnings'].append(f'point[{index}] invalid: lat/lon required')
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            payload['warnings'].append(f'point[{index}] invalid: lat/lon out of range')
            continue
        point_id = str(item.get('id') or f'point-{index + 1}')
        point_type = str(item.get('type') or 'default')
        name = str(item.get('name') or point_id)
        description = item.get('description')
        show_label = bool(item.get('show_label', False))

        normalized_points.append({
            'id': point_id,
            'name': name,
            'type': point_type,
            'lat': lat,
            'lon': lon,
            'description': None if description is None else str(description),
            'show_label': show_label,
        })

    payload['points'] = normalized_points

    normalized_paths = []
    for path_index, item in enumerate(raw_paths):
        if not isinstance(item, dict):
            payload['warnings'].append(f'path[{path_index}] invalid: expected object')
            continue

        raw_path_points = item.get('points', item.get('coordinates', []))
        if not isinstance(raw_path_points, list):
            payload['warnings'].append(f'path[{path_index}] invalid: points expected array')
            continue

        path_points = []
        for point_index, point in enumerate(raw_path_points):
            lat = None
            lon = None
            if isinstance(point, dict):
                lat = _parse_float(point.get('lat'))
                lon = _parse_float(point.get('lon'))
            elif isinstance(point, list) and len(point) >= 2:
                lat = _parse_float(point[0])
                lon = _parse_float(point[1])

            if lat is None or lon is None:
                payload['warnings'].append(
                    f'path[{path_index}].points[{point_index}] invalid: lat/lon required'
                )
                continue
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                payload['warnings'].append(
                    f'path[{path_index}].points[{point_index}] invalid: lat/lon out of range'
                )
                continue

            path_points.append({'lat': lat, 'lon': lon})

        if len(path_points) < 2:
            payload['warnings'].append(f'path[{path_index}] invalid: at least 2 valid points required')
            continue

        path_id = str(item.get('id') or f'path-{path_index + 1}')
        path_type = str(item.get('type') or 'default')
        name = str(item.get('name') or path_id)
        description = item.get('description')
        show_label = bool(item.get('show_label', False))
        show_endpoints = bool(item.get('show_endpoints', True))

        normalized_paths.append({
            'id': path_id,
            'name': name,
            'type': path_type,
            'points': path_points,
            'description': None if description is None else str(description),
            'show_label': show_label,
            'show_endpoints': show_endpoints,
        })

    payload['paths'] = normalized_paths
    return payload


async def background_loop():
    while True:
        try:
            await poll_all_sources(store)
            now = datetime.now()
            ready_times = []
            for t in list(store.track_store.keys()):
                if t in store.aligned_store:
                    continue
                arrival_at = store.track_arrival_at.get(t, now)
                if (now - arrival_at).total_seconds() >= ALIGN_DELAY_SEC:
                    ready_times.append(t)

            for t in sorted(ready_times):
                frame = align_one_time(t, store, mwr_hold_sec=MWR_HOLD_SEC)
                if frame is None:
                    continue
                store.put_aligned(frame)
                await manager.broadcast(frame.to_dict())
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Keep the first version resilient. Detailed logging can be added later.
            print(f'[background_loop] error: {exc}')
        await asyncio.sleep(POLL_INTERVAL_SEC)


@app.get('/api/status')
def status():
    latest = store.latest_aligned()
    return {
        'track_count': len(store.track_store),
        'scdp_count': len(store.scdp_store),
        'icfp_count': len(store.icfp_store),
        'mwr_count': len(store.mwr_store),
        'aligned_count': len(store.aligned_store),
        'max_history_seconds': store.max_history_seconds,
        'poll_interval_sec': POLL_INTERVAL_SEC,
        'latest_time': None if latest is None else latest.time.isoformat(),
        'file_states': store.file_states,
    }


@app.get('/api/latest')
def latest():
    latest_frame = store.latest_aligned()
    return {} if latest_frame is None else latest_frame.to_dict()


@app.get('/api/history')
def history(seconds: int = 300):
    if seconds <= 0:
        return []
    capped = min(seconds, store.max_history_seconds)
    items = list(store.aligned_store.values())[-capped:]
    return [item.to_dict() for item in items]


@app.get('/api/map-config')
def map_config():
    has_local_tiles = tiles_dir.exists()
    return {
        'has_local_tiles': has_local_tiles,
        'local_url_template': MAP_LOCAL_URL_TEMPLATE,
        'online_url_template': MAP_ONLINE_URL_TEMPLATE,
        'satellite_url_template': MAP_SATELLITE_URL_TEMPLATE,
        'attribution': MAP_ATTRIBUTION,
        'satellite_attribution': MAP_SATELLITE_ATTRIBUTION,
        'min_zoom': MAP_MIN_ZOOM,
        'max_zoom': MAP_MAX_ZOOM,
    }


@app.get('/api/important-points')
def important_points():
    return load_important_points()


@app.get('/')
def index():
    index_file = frontend_dir / 'index.html'
    if index_file.exists():
        return FileResponse(index_file)
    return {'message': 'Frontend not found.'}


@app.websocket('/ws/realtime')
async def realtime(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app:app', host=HOST, port=PORT, reload=False)
