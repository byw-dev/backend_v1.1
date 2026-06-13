import asyncio
import json
import os
import time
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import requests
import config as runtime_config
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from aligner import align_one_time
from auth import (
    COOKIE_NAME,
    authenticate,
    create_session_token,
    has_permission,
    is_auth_enabled,
    public_user,
    system_user,
    verify_session_token,
)
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
    HIMAWARI_FD_TARGET_TIMES_URL,
    HIMAWARI_FD_TILE_URL_TEMPLATE,
    HIMAWARI_JP_TARGET_TIMES_URL,
    HIMAWARI_JP_TILE_URL_TEMPLATE,
    HIMAWARI_PRODUCTS,
    HIMAWARI_PREFERRED_IMAGE_FORMATS,
    HIMAWARI_REFRESH_SECONDS,
    RAINVIEWER_API_URL,
    RAINVIEWER_COLOR_SCHEME,
    RAINVIEWER_DEFAULT_OPACITY,
    RAINVIEWER_MAX_NATIVE_ZOOM,
    RAINVIEWER_SMOOTH,
    RAINVIEWER_SNOW,
    RAINVIEWER_TILE_SIZE,
    LOCAL_RADAR_AZIMUTH_STEP_DEG,
    LOCAL_RADAR_BASE_DIR,
    LOCAL_RADAR_DEFAULT_OPACITY,
    LOCAL_RADAR_DEFAULT_PRODUCT,
    LOCAL_RADAR_GATE_RESOLUTION_KM,
    LOCAL_RADAR_LAT,
    LOCAL_RADAR_LON,
    LOCAL_RADAR_MAX_RANGE_KM,
    LOCAL_RADAR_PRODUCTS,
    LOCAL_RADAR_RANGE_BIN_KM,
    LOCAL_RADAR_REFRESH_SECONDS,
    LOCAL_RADAR_SITE_NAME,
    LOCAL_RADAR_VARIABLE,
    IMPORTANT_POINTS_FILE,
    ICFP_LOOKBACK_SEC,
    MAX_HISTORY_SECONDS,
    MWR_HOLD_SEC,
    POLL_INTERVAL_SEC,
    PORT,
)
from local_radar import build_local_radar_payload
from publisher import ConnectionManager
from readers import get_runtime_data_source_payload, poll_all_sources, set_runtime_data_source
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


def _runtime_base_dir() -> Path:
    return Path(os.environ.get('BY_WEATHER_BASE_DIR', Path(__file__).parent)).resolve()


def _runtime_path(path: Path) -> Path:
    path = Path(path)
    return path if path.is_absolute() else _runtime_base_dir() / path


def _local_radar_base_dir_for_date(date2: str) -> Path:
    configured = Path(LOCAL_RADAR_BASE_DIR)
    if str(configured.name) == str(getattr(runtime_config, 'DATE2', '')):
        return _runtime_path(configured.parent / date2)
    return _runtime_path(configured)


frontend_dir = _runtime_base_dir() / 'frontend'
tiles_dir = _runtime_path(MAP_TILES_DIR)
local_radar_base_dir = _runtime_path(LOCAL_RADAR_BASE_DIR)
himawari_cache = {
    'loaded_at': 0.0,
    'payload': None,
}
local_radar_cache = {
    'loaded_at': 0.0,
    'product': None,
    'payload': None,
}

if frontend_dir.exists():
    app.mount('/static', StaticFiles(directory=frontend_dir), name='static')
if tiles_dir.exists():
    app.mount('/tiles', StaticFiles(directory=tiles_dir), name='tiles')


def _login_page(error_text=''):
    error_html = f'<p class="login-error">{error_text}</p>' if error_text else ''
    return HTMLResponse(f'''<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BY Weather 登录</title>
    <style>
        body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:#0f172a; color:#e5e7eb; font-family:Arial,"Microsoft YaHei",sans-serif; }}
        .login-card {{ width:min(380px, calc(100vw - 32px)); padding:28px; background:#111827; border:1px solid #334155; border-radius:8px; box-shadow:0 20px 60px rgba(0,0,0,.35); }}
        h1 {{ margin:0 0 6px; font-size:24px; }}
        p {{ margin:0 0 18px; color:#94a3b8; }}
        label {{ display:block; margin:14px 0 6px; color:#cbd5e1; font-size:14px; }}
        input {{ width:100%; box-sizing:border-box; border:1px solid #475569; background:#020617; color:#f8fafc; border-radius:6px; padding:10px 12px; font-size:15px; }}
        button {{ width:100%; margin-top:18px; border:0; border-radius:6px; padding:11px 12px; background:#38bdf8; color:#082f49; font-weight:700; cursor:pointer; }}
        .login-error {{ color:#fca5a5; margin-top:12px; }}
    </style>
</head>
<body>
    <form class="login-card" id="login-form">
        <h1>BY Weather</h1>
        <p>请输入账号密码进入指挥界面</p>
        <label for="username">账号</label>
        <input id="username" name="username" autocomplete="username" required>
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">登录</button>
        {error_html}
    </form>
    <script>
        document.getElementById('login-form').addEventListener('submit', async (event) => {{
            event.preventDefault();
            const payload = {{
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
            }};
            const response = await fetch('/api/login', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify(payload),
            }});
            if (response.ok) {{
                location.href = '/';
                return;
            }}
            location.href = '/login?error=1';
        }});
    </script>
</body>
</html>''')


def _user_from_request(request: Request):
    if not is_auth_enabled():
        return system_user()
    return verify_session_token(request.cookies.get(COOKIE_NAME))


def _require_user(request: Request):
    user = _user_from_request(request)
    if user is None:
        raise HTTPException(status_code=401, detail='login required')
    return user


def _user_from_websocket(websocket: WebSocket):
    if not is_auth_enabled():
        return system_user()
    return verify_session_token(websocket.cookies.get(COOKIE_NAME))


def _hidden_module():
    return {'status': 'hidden', 'data': {}, 'source_time': None, 'age_sec': None}


def _frame_for_user(frame_payload: dict, user: dict):
    if has_permission(user, 'view_all'):
        return frame_payload
    payload = json.loads(json.dumps(frame_payload))
    if not has_permission(user, 'view_particle_data'):
        payload['scdp'] = _hidden_module()
        payload['icfp'] = _hidden_module()
    if not has_permission(user, 'view_mwr_data'):
        payload['mwr'] = _hidden_module()
    return payload


def _status_for_user(payload: dict, user: dict):
    if has_permission(user, 'view_file_states'):
        return payload
    return {
        'aligned_count': payload.get('aligned_count'),
        'max_history_seconds': payload.get('max_history_seconds'),
        'poll_interval_sec': payload.get('poll_interval_sec'),
        'latest_time': payload.get('latest_time'),
        'data_source': payload.get('data_source'),
    }


def _map_config_for_user(payload: dict, user: dict):
    if has_permission(user, 'view_local_radar'):
        return payload
    cleaned = dict(payload)
    cleaned['local_radar_available'] = False
    cleaned['local_radar_products'] = []
    cleaned['local_radar_default_product'] = None
    cleaned['local_radar_site'] = None
    return cleaned


def _parse_runtime_date(value: str) -> str:
    try:
        return datetime.strptime(str(value or '').strip(), '%Y-%m-%d').strftime('%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail='date must be YYYY-MM-DD')


def _parse_runtime_num(value) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail='num must be a positive integer')
    if num <= 0:
        raise HTTPException(status_code=400, detail='num must be a positive integer')
    return num


def _clear_runtime_caches():
    store.reset()
    local_radar_cache['loaded_at'] = 0.0
    local_radar_cache['product'] = None
    local_radar_cache['payload'] = None


def _parse_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _load_himawari_metadata():
    now = time.time()
    cached = himawari_cache.get('payload')
    if cached and now - himawari_cache.get('loaded_at', 0.0) < HIMAWARI_REFRESH_SECONDS:
        return cached

    fd_base_time, fd_valid_time = _load_himawari_latest_time(HIMAWARI_FD_TARGET_TIMES_URL)
    jp_base_time, jp_valid_time = _load_himawari_latest_time(HIMAWARI_JP_TARGET_TIMES_URL)
    fd_image_format = _pick_himawari_image_format(
        HIMAWARI_FD_TILE_URL_TEMPLATE,
        fd_base_time,
        fd_valid_time,
        5,
        26,
        12,
    )
    jp_image_format = _pick_himawari_image_format(
        HIMAWARI_JP_TILE_URL_TEMPLATE,
        jp_base_time,
        jp_valid_time,
        6,
        53,
        24,
    )
    payload = {
        'fd': {
            'base_time': fd_base_time,
            'valid_time': fd_valid_time,
            'tile_url_template': HIMAWARI_FD_TILE_URL_TEMPLATE,
            'image_format': fd_image_format,
            'min_native_zoom': 3,
            'max_native_zoom': 5,
        },
        'jp': {
            'base_time': jp_base_time,
            'valid_time': jp_valid_time,
            'tile_url_template': HIMAWARI_JP_TILE_URL_TEMPLATE,
            'image_format': jp_image_format,
            'min_native_zoom': 6,
            'max_native_zoom': 6,
        },
        'refresh_seconds': HIMAWARI_REFRESH_SECONDS,
        'products': HIMAWARI_PRODUCTS,
        'attribution': 'Himawari-9 imagery &copy; JMA',
    }
    himawari_cache['loaded_at'] = now
    himawari_cache['payload'] = payload
    return payload


def _load_local_radar_metadata(product=None, force=False):
    selected = (product or LOCAL_RADAR_DEFAULT_PRODUCT or 'PPI').upper()
    if selected not in {item.upper() for item in LOCAL_RADAR_PRODUCTS}:
        selected = (LOCAL_RADAR_DEFAULT_PRODUCT or LOCAL_RADAR_PRODUCTS[0]).upper()
    now = time.time()
    cached = local_radar_cache.get('payload')
    if (
        not force
        and cached
        and local_radar_cache.get('product') == selected
        and now - local_radar_cache.get('loaded_at', 0.0) < LOCAL_RADAR_REFRESH_SECONDS
    ):
        return cached

    payload = build_local_radar_payload(
        local_radar_base_dir,
        products=[selected],
        variable=LOCAL_RADAR_VARIABLE,
        max_range_km=LOCAL_RADAR_MAX_RANGE_KM,
        gate_resolution_km=LOCAL_RADAR_GATE_RESOLUTION_KM,
        range_bin_km=LOCAL_RADAR_RANGE_BIN_KM,
        azimuth_step_deg=LOCAL_RADAR_AZIMUTH_STEP_DEG,
        radar_lat=LOCAL_RADAR_LAT,
        radar_lon=LOCAL_RADAR_LON,
    )
    if payload.get('available') and LOCAL_RADAR_SITE_NAME:
        payload.setdefault('radar', {})['site_name'] = LOCAL_RADAR_SITE_NAME
    local_radar_cache['loaded_at'] = now
    local_radar_cache['product'] = selected
    local_radar_cache['payload'] = payload
    return payload


def _load_himawari_latest_time(target_times_url):
    response = requests.get(target_times_url, timeout=20)
    response.raise_for_status()
    times = response.json()
    if not isinstance(times, list) or not times:
        raise ValueError(f'empty Himawari target times: {target_times_url}')

    latest = max(times, key=lambda item: str(item.get('validtime', '')))
    base_time = latest.get('basetime')
    valid_time = latest.get('validtime')
    if not base_time or not valid_time:
        raise ValueError(f'invalid Himawari latest time payload: {target_times_url}')
    return base_time, valid_time


def _pick_himawari_image_format(tile_url_template, base_time, valid_time, z, x, y):
    sample_product = HIMAWARI_PRODUCTS[0]
    for image_format in HIMAWARI_PREFERRED_IMAGE_FORMATS:
        sample_url = tile_url_template.format(
            base_time=base_time,
            valid_time=valid_time,
            band=sample_product['band'],
            product=sample_product['product'],
            z=z,
            x=x,
            y=y,
            format=image_format,
        )
        try:
            response = requests.get(sample_url, timeout=12, stream=True)
            response.close()
        except Exception:
            continue
        content_type = response.headers.get('content-type', '')
        if response.status_code < 400 and content_type.startswith('image/'):
            return image_format
    return 'jpg'


def load_important_points():
    payload = {
        'version': 1,
        'type_styles': {},
        'path_styles': {},
        'points': [],
        'paths': [],
        'warnings': [],
    }
    source_path = _runtime_path(IMPORTANT_POINTS_FILE)
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
        raw_coverage_radii = item.get('coverage_radii_km', [])
        coverage_radii_km = []
        if raw_coverage_radii:
            if not isinstance(raw_coverage_radii, list):
                payload['warnings'].append(f'point[{index}] coverage_radii_km invalid: expected array')
            else:
                for radius_index, radius_value in enumerate(raw_coverage_radii):
                    radius_km = _parse_float(radius_value)
                    if radius_km is None or radius_km <= 0:
                        payload['warnings'].append(
                            f'point[{index}] coverage_radii_km[{radius_index}] invalid: positive number required'
                        )
                        continue
                    coverage_radii_km.append(radius_km)

        coverage_color = None
        if item.get('coverage_color') is not None:
            raw_coverage_color = str(item.get('coverage_color')).strip()
            if raw_coverage_color:
                coverage_color = raw_coverage_color

        azimuth_sector_count = None
        if item.get('azimuth_sector_count') is not None:
            try:
                candidate = int(item.get('azimuth_sector_count'))
            except (TypeError, ValueError):
                candidate = 0
            if 1 <= candidate <= 72:
                azimuth_sector_count = candidate
            else:
                payload['warnings'].append(
                    f'point[{index}] azimuth_sector_count invalid: expected integer in [1, 72]'
                )

        azimuth_radius_km = None
        if item.get('azimuth_radius_km') is not None:
            azimuth_radius_km = _parse_float(item.get('azimuth_radius_km'))
            if azimuth_radius_km is None or azimuth_radius_km <= 0:
                payload['warnings'].append(
                    f'point[{index}] azimuth_radius_km invalid: positive number required'
                )
                azimuth_radius_km = None

        azimuth_start_deg = _parse_float(item.get('azimuth_start_deg'))
        if azimuth_start_deg is None:
            azimuth_start_deg = 0.0

        normalized_points.append({
            'id': point_id,
            'name': name,
            'type': point_type,
            'lat': lat,
            'lon': lon,
            'description': None if description is None else str(description),
            'show_label': show_label,
            'coverage_radii_km': coverage_radii_km,
            'coverage_color': coverage_color,
            'azimuth_sector_count': azimuth_sector_count,
            'azimuth_radius_km': azimuth_radius_km,
            'azimuth_start_deg': azimuth_start_deg,
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
            poll_result = await poll_all_sources(store)
            backfill_times = set()
            for icfp_record in poll_result.get('icfp_records', []):
                start_time = icfp_record.time
                end_time = start_time + timedelta(seconds=ICFP_LOOKBACK_SEC)
                for t in store.track_store.keys():
                    if start_time <= t <= end_time and t in store.aligned_store:
                        backfill_times.add(t)

            for mwr_record in poll_result.get('mwr_records', []):
                start_time = mwr_record.time
                end_time = start_time + timedelta(seconds=MWR_HOLD_SEC)
                for t in store.track_store.keys():
                    if start_time <= t <= end_time and t in store.aligned_store:
                        backfill_times.add(t)

            for t in sorted(backfill_times):
                frame = align_one_time(
                    t,
                    store,
                    mwr_hold_sec=MWR_HOLD_SEC,
                    icfp_lookback_sec=ICFP_LOOKBACK_SEC,
                )
                if frame is None:
                    continue
                store.put_aligned(frame)
                await manager.broadcast(frame.to_dict(), prepare=_frame_for_user)

            now = datetime.now()
            ready_times = []
            for t in list(store.track_store.keys()):
                if t in store.aligned_store:
                    continue
                arrival_at = store.track_arrival_at.get(t, now)
                if (now - arrival_at).total_seconds() >= ALIGN_DELAY_SEC:
                    ready_times.append(t)

            for t in sorted(ready_times):
                frame = align_one_time(
                    t,
                    store,
                    mwr_hold_sec=MWR_HOLD_SEC,
                    icfp_lookback_sec=ICFP_LOOKBACK_SEC,
                )
                if frame is None:
                    continue
                store.put_aligned(frame)
                await manager.broadcast(frame.to_dict(), prepare=_frame_for_user)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Keep the first version resilient. Detailed logging can be added later.
            print(f'[background_loop] error: {exc}')
        await asyncio.sleep(POLL_INTERVAL_SEC)


@app.get('/api/status')
def status(request: Request):
    user = _require_user(request)
    latest = store.latest_aligned()
    latest_mwr_time = None
    latest_mwr_arrival_at = None
    latest_mwr_arrival_lag_sec = None
    if store.mwr_store:
        latest_mwr_time = next(reversed(store.mwr_store.keys()))
        latest_mwr_arrival_at = store.mwr_arrival_at.get(latest_mwr_time)
        if latest_mwr_arrival_at is not None:
            latest_mwr_arrival_lag_sec = int((latest_mwr_arrival_at - latest_mwr_time).total_seconds())
    payload = {
        'track_count': len(store.track_store),
        'scdp_count': len(store.scdp_store),
        'icfp_count': len(store.icfp_store),
        'mwr_count': len(store.mwr_store),
        'aligned_count': len(store.aligned_store),
        'max_history_seconds': store.max_history_seconds,
        'poll_interval_sec': POLL_INTERVAL_SEC,
        'latest_time': None if latest is None else latest.time.isoformat(),
        'latest_mwr_time': None if latest_mwr_time is None else latest_mwr_time.isoformat(),
        'latest_mwr_arrival_at': None if latest_mwr_arrival_at is None else latest_mwr_arrival_at.isoformat(),
        'latest_mwr_arrival_lag_sec': latest_mwr_arrival_lag_sec,
        'file_states': store.file_states,
        'data_source': get_runtime_data_source_payload(),
    }
    return _status_for_user(payload, user)


@app.get('/api/latest')
def latest(request: Request):
    user = _require_user(request)
    latest_frame = store.latest_aligned()
    return {} if latest_frame is None else _frame_for_user(latest_frame.to_dict(), user)


@app.get('/api/history')
def history(request: Request, seconds: int = 300):
    user = _require_user(request)
    if seconds <= 0:
        return []
    capped = min(seconds, store.max_history_seconds)
    items = list(store.aligned_store.values())[-capped:]
    return [_frame_for_user(item.to_dict(), user) for item in items]


@app.get('/api/map-config')
def map_config(request: Request):
    user = _require_user(request)
    has_local_tiles = tiles_dir.exists()
    payload = {
        'has_local_tiles': has_local_tiles,
        'local_url_template': MAP_LOCAL_URL_TEMPLATE,
        'online_url_template': MAP_ONLINE_URL_TEMPLATE,
        'satellite_url_template': MAP_SATELLITE_URL_TEMPLATE,
        'attribution': MAP_ATTRIBUTION,
        'satellite_attribution': MAP_SATELLITE_ATTRIBUTION,
        'min_zoom': MAP_MIN_ZOOM,
        'max_zoom': MAP_MAX_ZOOM,
        'rainviewer_api_url': RAINVIEWER_API_URL,
        'rainviewer_tile_size': RAINVIEWER_TILE_SIZE,
        'rainviewer_max_native_zoom': RAINVIEWER_MAX_NATIVE_ZOOM,
        'rainviewer_default_opacity': RAINVIEWER_DEFAULT_OPACITY,
        'rainviewer_color_scheme': RAINVIEWER_COLOR_SCHEME,
        'rainviewer_smooth': RAINVIEWER_SMOOTH,
        'rainviewer_snow': RAINVIEWER_SNOW,
        'local_radar_available': local_radar_base_dir.exists(),
        'local_radar_products': LOCAL_RADAR_PRODUCTS,
        'local_radar_default_product': LOCAL_RADAR_DEFAULT_PRODUCT,
        'local_radar_variable': LOCAL_RADAR_VARIABLE,
        'local_radar_refresh_seconds': LOCAL_RADAR_REFRESH_SECONDS,
        'local_radar_default_opacity': LOCAL_RADAR_DEFAULT_OPACITY,
        'local_radar_max_range_km': LOCAL_RADAR_MAX_RANGE_KM,
        'local_radar_site': {
            'lat': LOCAL_RADAR_LAT,
            'lon': LOCAL_RADAR_LON,
            'name': LOCAL_RADAR_SITE_NAME,
        },
        'himawari_products': HIMAWARI_PRODUCTS,
        'himawari_preferred_image_formats': HIMAWARI_PREFERRED_IMAGE_FORMATS,
        'himawari_refresh_seconds': HIMAWARI_REFRESH_SECONDS,
        'himawari_native_min_zoom': 3,
        'himawari_native_max_zoom': 6,
    }
    return _map_config_for_user(payload, user)


@app.get('/api/data-source')
def data_source(request: Request):
    _require_user(request)
    return get_runtime_data_source_payload()


@app.post('/api/data-source')
async def update_data_source(request: Request):
    _require_user(request)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    date1 = _parse_runtime_date(payload.get('date1') or payload.get('date'))
    num = _parse_runtime_num(payload.get('num', 1))
    source = set_runtime_data_source(date1, num)

    global local_radar_base_dir
    local_radar_base_dir = _local_radar_base_dir_for_date(source['date2'])
    _clear_runtime_caches()

    return {
        **get_runtime_data_source_payload(),
        'message': 'runtime data source updated; this change is not persisted and will reset on restart',
    }


@app.get('/api/himawari/latest')
def himawari_latest(request: Request):
    _require_user(request)
    try:
        return _load_himawari_metadata()
    except Exception as exc:
        return {
            'error': str(exc),
            'products': HIMAWARI_PRODUCTS,
            'image_format': 'jpg',
        }


@app.get('/api/local-radar/latest')
def local_radar_latest(request: Request, product: Optional[str] = None, force: bool = False):
    user = _require_user(request)
    if not has_permission(user, 'view_local_radar'):
        raise HTTPException(status_code=403, detail='local radar is not allowed for this role')
    try:
        return _load_local_radar_metadata(product=product, force=force)
    except Exception as exc:
        return {
            'available': False,
            'error': str(exc),
            'base_dir': str(local_radar_base_dir),
            'products': LOCAL_RADAR_PRODUCTS,
        }


@app.get('/api/important-points')
def important_points(request: Request):
    _require_user(request)
    return load_important_points()


@app.get('/login')
def login_page(request: Request):
    if _user_from_request(request) is not None:
        index_file = frontend_dir / 'index.html'
        if index_file.exists():
            return FileResponse(index_file)
    error_text = '账号或密码错误' if request.query_params.get('error') else ''
    return _login_page(error_text)


@app.post('/api/login')
async def login(request: Request, response: Response):
    if not is_auth_enabled():
        return public_user(system_user())
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    user = authenticate(payload.get('username'), payload.get('password'))
    if user is None:
        raise HTTPException(status_code=401, detail='invalid username or password')
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user),
        max_age=int(getattr(runtime_config, 'SESSION_TTL_SECONDS', 12 * 60 * 60)),
        httponly=True,
        samesite='lax',
    )
    return public_user(user)


@app.post('/api/logout')
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {'ok': True}


@app.get('/api/me')
def me(request: Request):
    user = _require_user(request)
    return public_user(user)


@app.get('/')
def index(request: Request):
    if _user_from_request(request) is None:
        return _login_page()
    index_file = frontend_dir / 'index.html'
    if index_file.exists():
        return FileResponse(
            index_file,
            headers={
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
            },
        )
    return {'message': 'Frontend not found.'}


@app.websocket('/ws/realtime')
async def realtime(websocket: WebSocket):
    user = _user_from_websocket(websocket)
    if user is None:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, user)
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
