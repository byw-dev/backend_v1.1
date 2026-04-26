from pathlib import Path

# Source files used by the realtime simulator.
SOURCE_TRACK_FILE = Path('G:/B11/2026-03-03_1/20260303_1_B11.csv')
SOURCE_SCDP_FILE = Path('G:/B11/2026-03-03_1/WR_SCDP/SCDP_B11_20260303.csv')
SOURCE_ICFP_FILE = Path('G:/B11/2026-03-03_1/WR_ICFP/ICFP_20260303_1_B11.csv')
SOURCE_MWR_FILE = Path('G:/WR_YMWR/B11/20260303/Z_UPAR_I_59134_20260303000000_P_YMWR_TK001_CP_D.TXT')

# Realtime simulator output files.
SIM_OUTPUT_DIR = Path('simulated_data')

TRACK_FILE = Path('G:/B11/2026-04-23_2/20260423_2_B11.csv')
SCDP_FILE = Path('G:/B11/2026-04-23_2/WR_SCDP/SCDP_B11_20260423.csv')
ICFP_FILE = Path('G:/B11/2026-04-23_2/WR_ICFP/ICFP_20260423_2_B11.csv')
MWR_FILE = Path('G:/WR_YMWR/B11/20260423/Z_UPAR_I_59134_20260423000000_P_YMWR_TK001_CP_D.TXT')

# Data source policy
# False: business mode (strictly read realtime business files only)
# True: non-business mode (allow fallback to simulated_data when primary file is missing)
ALLOW_SIMULATED_FALLBACK = False
# Runtime behavior
POLL_INTERVAL_SEC = 0.5
ALIGN_DELAY_SEC = 2.0
MWR_HOLD_SEC = 15
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
