import os
from pathlib import Path

# Env-driven overrides (set via .env in deployment)
#
# When the service runs via `uvicorn app:app` CLI (systemd mode),
# uvicorn reads UVICORN_HOST, UVICORN_PORT and FORWARDED_ALLOW_IPS
# from the environment natively — set those in .env.
#
# When the app runs via `python app.py` or `python launcher.py`
# (development mode), config.HOST and config.PORT are used directly
# — they also fall back to plain HOST/PORT env vars for convenience.

_env_host = os.getenv('HOST')
_env_port = os.getenv('PORT')
_env_data_base = os.getenv('BACKEND_DATA_BASE_DIR')
_env_date1 = os.getenv('BACKEND_DATE1')
_env_num = os.getenv('BACKEND_NUM')
_env_fallback = os.getenv('BACKEND_ALLOW_SIMULATED_FALLBACK')
_env_secret = os.getenv('BACKEND_AUTH_SECRET_KEY')
_env_radar_base = os.getenv('BACKEND_LOCAL_RADAR_BASE_DIR')

# Source files used by the realtime simulator.
SOURCE_TRACK_FILE = Path('G:/B11/2026-03-03_1/20260303_1_B11.csv')
SOURCE_SCDP_FILE = Path('G:/B11/2026-03-03_1/WR_SCDP/SCDP_B11_20260303.csv')
SOURCE_ICFP_FILE = Path('G:/B11/2026-03-03_1/WR_ICFP/ICFP_20260303_1_B11.csv')
SOURCE_MWR_FILE = Path('G:/WR_YMWR/B11/20260303/Z_UPAR_I_59134_20260303000000_P_YMWR_TK001_CP_D.TXT')

# Realtime simulator output files.
SIM_OUTPUT_DIR = Path('simulated_data')

# Business data paths
DATE1 = _env_date1 or "2026-05-30"
DATE2 = DATE1.replace('-', '')
NUM = int(_env_num) if _env_num else 1

if _env_data_base:
    DATA_BASE_DIR = Path(_env_data_base)
else:
    DATA_BASE_DIR = Path(f'G:/B11')

TRACK_FILE = DATA_BASE_DIR / f'{DATE1}_{NUM}' / f'{DATE2}_{NUM}_B11.csv'
SCDP_FILE = DATA_BASE_DIR / f'{DATE1}_{NUM}' / 'WR_SCDP' / f'SCDP_B11_{DATE2}.csv'
ICFP_FILE = DATA_BASE_DIR / f'{DATE1}_{NUM}' / 'WR_ICFP' / f'ICFP_{DATE2}_{NUM}_B11.csv'
MWR_FILE = DATA_BASE_DIR / f'{DATE1}_{NUM}' / 'WR_YMWR' / f'Z_UPAR_I_59134_{DATE2}000000_P_YMWR_TK001_CP_D.TXT'

# Data source policy
ALLOW_SIMULATED_FALLBACK = (_env_fallback or 'false').lower() in ('1', 'true', 'yes')

# Runtime behavior
POLL_INTERVAL_SEC = 0.5
ALIGN_DELAY_SEC = 2.0
MWR_HOLD_SEC = 15
ICFP_LOOKBACK_SEC = 300
MAX_HISTORY_SECONDS = 3600

# Simulation behavior
TRACK_SIM_INTERVAL_SEC = 1.0
SCDP_SIM_INTERVAL_SEC = 1.0
ICFP_SIM_INTERVAL_SEC = 1.0
MWR_SIM_INTERVAL_SEC = 15.0
SIM_RANDOM_JITTER_SEC = 0.25
SIM_SKIP_SECONDS = 0
TRACK_SIM_SKIP_SECONDS = SIM_SKIP_SECONDS

# Network
HOST = _env_host or '127.0.0.1'
PORT = int(_env_port) if _env_port else 8000
AUTO_OPEN_BROWSER = True

# Auth
AUTH_ENABLED = True
AUTH_SECRET_KEY = _env_secret or 'change-this-local-session-secret'
SESSION_TTL_SECONDS = 12 * 60 * 60
ROLE_PERMISSIONS = {
    'full': [
        'view_all',
        'view_charts',
        'view_particle_data',
        'view_mwr_data',
        'view_local_radar',
        'view_file_states',
    ],
    'lite': [
        'view_map',
        'view_replay',
        'view_weather_overlays',
        'view_important_points',
        'use_map_tools',
    ],
}
AUTH_USERS = [
    {
        'username': 'admin',
        'password': 'admin123',
        'display_name': '全量账号',
        'role': 'full',
    },
    {
        'username': 'lite',
        'password': 'lite123',
        'display_name': '精简账号',
        'role': 'lite',
    },
]

# Map tiles
MAP_TILES_DIR = Path('map_tiles')
MAP_LOCAL_URL_TEMPLATE = '/tiles/{z}/{x}/{y}.png'
MAP_ONLINE_URL_TEMPLATE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
MAP_SATELLITE_URL_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors'
MAP_SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri'
MAP_MIN_ZOOM = 4
MAP_MAX_ZOOM = 19
RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json'
RAINVIEWER_TILE_SIZE = 512
RAINVIEWER_MAX_NATIVE_ZOOM = 7
RAINVIEWER_DEFAULT_OPACITY = 0.55
RAINVIEWER_COLOR_SCHEME = 2
RAINVIEWER_SMOOTH = 1
RAINVIEWER_SNOW = 1

# Local cloud radar
LOCAL_RADAR_BASE_DIR = Path(_env_radar_base).expanduser() if _env_radar_base else Path(r'D:/APP/radar_uploader_split/downloads') / DATE2
LOCAL_RADAR_PRODUCTS = ['PPI', 'RPI']
LOCAL_RADAR_DEFAULT_PRODUCT = 'PPI'
LOCAL_RADAR_VARIABLE = 'Z2'
LOCAL_RADAR_REFRESH_SECONDS = 20
LOCAL_RADAR_MAX_RANGE_KM = 50.0
LOCAL_RADAR_GATE_RESOLUTION_KM = 0.03
LOCAL_RADAR_RANGE_BIN_KM = 0.3
LOCAL_RADAR_AZIMUTH_STEP_DEG = 2.0
LOCAL_RADAR_DEFAULT_OPACITY = 0.72
LOCAL_RADAR_LAT = 20.96194444
LOCAL_RADAR_LON = 110.06777778
LOCAL_RADAR_SITE_NAME = '雷州云雷达'

# Himawari
HIMAWARI_FD_TARGET_TIMES_URL = 'https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json'
HIMAWARI_JP_TARGET_TIMES_URL = 'https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_jp.json'
HIMAWARI_FD_TILE_URL_TEMPLATE = 'https://www.jma.go.jp/bosai/himawari/data/satimg/{base_time}/fd/{valid_time}/{band}/{product}/{z}/{x}/{y}.{format}'
HIMAWARI_JP_TILE_URL_TEMPLATE = 'https://www.jma.go.jp/bosai/himawari/data/satimg/{base_time}/jp/{valid_time}/{band}/{product}/{z}/{x}/{y}.{format}'
HIMAWARI_PREFERRED_IMAGE_FORMATS = ['png', 'jpg']
HIMAWARI_REFRESH_SECONDS = 600
HIMAWARI_PRODUCTS = [
    {
        'id': 'infrared_b13',
        'label': 'Himawari 红外 B13',
        'band': 'B13',
        'product': 'TBB',
        'opacity': 0.72,
    },
    {
        'id': 'visible_b03',
        'label': 'Himawari 可见光 B03',
        'band': 'B03',
        'product': 'ALBD',
        'opacity': 0.68,
    },
]
IMPORTANT_POINTS_FILE = Path('reference/important_points.json')

# Track column mapping
TRACK_COLS = {
    'date': 2,
    'time': 3,
    'lon': 4,
    'lat': 5,
    'alt': 6,
    'speed': 13,
    'heading': 14,
}

# MWR levels to keep
MWR_LEVELS_M = [
    0, 25, 50, 75, 100, 125, 150, 175, 200, 225,
    250, 275, 300, 325, 350, 375, 400, 425, 450, 475,
    500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000,
]
