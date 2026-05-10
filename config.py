from pathlib import Path

# Source files used by the realtime simulator.
SOURCE_TRACK_FILE = Path('G:/B11/2026-03-03_1/20260303_1_B11.csv')
SOURCE_SCDP_FILE = Path('G:/B11/2026-03-03_1/WR_SCDP/SCDP_B11_20260303.csv')
SOURCE_ICFP_FILE = Path('G:/B11/2026-03-03_1/WR_ICFP/ICFP_20260303_1_B11.csv')
SOURCE_MWR_FILE = Path('G:/WR_YMWR/B11/20260303/Z_UPAR_I_59134_20260303000000_P_YMWR_TK001_CP_D.TXT')

# Realtime simulator output files.
SIM_OUTPUT_DIR = Path('simulated_data')

DATE1 = "2026-05-04"
DATE2 = "20260504"
NUM = 1
TRACK_FILE = Path(f'G:/B11/{DATE1}_{NUM}/{DATE2}_{NUM}_B11.csv')
SCDP_FILE = Path(f'G:/B11/{DATE1}_{NUM}/WR_SCDP/SCDP_B11_{DATE2}.csv')
ICFP_FILE = Path(f'G:/B11/{DATE1}_{NUM}/WR_ICFP/ICFP_{DATE2}_{NUM}_B11.csv')
MWR_FILE = Path(f'G:/B11/{DATE1}_{NUM}/WR_YMWR/Z_UPAR_I_59134_{DATE2}000000_P_YMWR_TK001_CP_D.TXT')

# Data source policy
# False: business mode (strictly read realtime business files only)
# True: non-business mode (allow fallback to simulated_data when primary file is missing)
ALLOW_SIMULATED_FALLBACK = False
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
# Skip first M seconds of source data when simulator starts.
SIM_SKIP_SECONDS = 0
# Backward-compatible alias for older references.
TRACK_SIM_SKIP_SECONDS = SIM_SKIP_SECONDS

# Network
HOST = '127.0.0.1'
PORT = 8000
AUTO_OPEN_BROWSER = True

# Map tiles
# Put offline tiles under this directory using {z}/{x}/{y}.png layout.
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

# Track fixed-column mapping
TRACK_COLS = {
    'date': 2,
    'time': 3,
    'lon': 4,
    'lat': 5,
    'alt': 6,
    'speed': 13,
    'heading': 14,
}

# MWR 0-1 km levels to keep
MWR_LEVELS_M = [
    0, 25, 50, 75, 100, 125, 150, 175, 200, 225,
    250, 275, 300, 325, 350, 375, 400, 425, 450, 475,
    500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000,
]
