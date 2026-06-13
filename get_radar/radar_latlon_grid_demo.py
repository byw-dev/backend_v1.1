from pathlib import Path
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from scipy.spatial import cKDTree


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from local_radar import extract_polar_product, find_latest_radar_file, read_ka_cma


RADAR_BASE_DIR = Path(r'D:/APP/radar_uploader_split/downloads/20260528')
RADAR_LAT = 20.96194444
RADAR_LON = 110.06777778
PRODUCT = 'PPI'
VARIABLE = 'Z2'
MAX_RANGE_KM = 50.0
GATE_RESOLUTION_KM = 0.03
GRID_RESOLUTION_DEG = 0.005
SEARCH_RADIUS_KM = 0.8
GRID_METHODS = ['nearest', 'barnes_like']
OUTPUT_DIR = Path(__file__).resolve().parent / 'grid_demo_outputs'


RADAR_CMAP_COLORS = [
    '#e5e7eb',
    '#9ca3af',
    '#38bdf8',
    '#2563eb',
    '#22c55e',
    '#84cc16',
    '#facc15',
    '#f97316',
    '#ef4444',
    '#b91c1c',
    '#a855f7',
    '#f0abfc',
]
RADAR_LEVELS = [-45, -30, -20, -10, 0, 5, 10, 15, 20, 25, 30, 35, 40]


def local_xy_to_latlon(x_km, y_km, radar_lat, radar_lon):
    lat = radar_lat + y_km / 111.32
    lon = radar_lon + x_km / (111.32 * np.cos(np.deg2rad(radar_lat)))
    return lat, lon


def latlon_to_local_xy(lat, lon, radar_lat, radar_lon):
    y_km = (lat - radar_lat) * 111.32
    x_km = (lon - radar_lon) * 111.32 * np.cos(np.deg2rad(radar_lat))
    return x_km, y_km


def radar_colormap():
    cmap = matplotlib.colors.ListedColormap(RADAR_CMAP_COLORS)
    norm = matplotlib.colors.BoundaryNorm(RADAR_LEVELS, cmap.N)
    return cmap, norm


def centers_to_edges(values):
    values = np.asarray(values, dtype=float)
    if values.size < 2:
        step = 1.0
        return np.array([values[0] - step / 2, values[0] + step / 2])
    diffs = np.diff(values)
    edges = np.empty(values.size + 1, dtype=float)
    edges[1:-1] = values[:-1] + diffs / 2
    edges[0] = values[0] - diffs[0] / 2
    edges[-1] = values[-1] + diffs[-1] / 2
    return edges


def sort_polar_product(product):
    azimuth = np.asarray(product['azimuth'], dtype=float) % 360.0
    data = np.asarray(product['data'], dtype=float)
    order = np.argsort(azimuth)
    return azimuth[order], data[order, :]


def polar_gate_points(azimuth_deg, data, gate_resolution_km):
    range_km = (np.arange(data.shape[1], dtype=float) + 0.5) * gate_resolution_km
    theta = np.deg2rad(azimuth_deg)
    r_grid, theta_grid = np.meshgrid(range_km, theta)
    values = data.reshape(-1)
    x_km = (r_grid * np.sin(theta_grid)).reshape(-1)
    y_km = (r_grid * np.cos(theta_grid)).reshape(-1)
    finite = np.isfinite(values)
    return x_km[finite], y_km[finite], values[finite]


def make_latlon_grid(radar_lat, radar_lon, max_range_km, resolution_deg):
    lat_delta = max_range_km / 111.32
    lon_delta = max_range_km / (111.32 * np.cos(np.deg2rad(radar_lat)))
    latitudes = np.arange(radar_lat - lat_delta, radar_lat + lat_delta + resolution_deg * 0.5, resolution_deg)
    longitudes = np.arange(radar_lon - lon_delta, radar_lon + lon_delta + resolution_deg * 0.5, resolution_deg)
    lon_grid, lat_grid = np.meshgrid(longitudes, latitudes)
    x_grid, y_grid = latlon_to_local_xy(lat_grid, lon_grid, radar_lat, radar_lon)
    range_grid = np.hypot(x_grid, y_grid)
    return latitudes, longitudes, x_grid, y_grid, range_grid


def barnes_like_grid(
    gate_x_km,
    gate_y_km,
    gate_values,
    grid_x_km,
    grid_y_km,
    max_range_km,
    search_radius_km,
):
    tree = cKDTree(np.column_stack([gate_x_km, gate_y_km]))
    grid_points = np.column_stack([grid_x_km.reshape(-1), grid_y_km.reshape(-1)])
    neighbors = tree.query_ball_point(grid_points, r=search_radius_km)
    output = np.full(grid_points.shape[0], np.nan, dtype=float)
    kappa = search_radius_km ** 2

    for index, neighbor_indices in enumerate(neighbors):
        if not neighbor_indices:
            continue
        gx, gy = grid_points[index]
        if np.hypot(gx, gy) > max_range_km:
            continue
        candidate = np.asarray(neighbor_indices, dtype=int)
        dx = gate_x_km[candidate] - gx
        dy = gate_y_km[candidate] - gy
        dist2 = dx * dx + dy * dy
        weights = np.exp(-dist2 / kappa)
        weight_sum = weights.sum()
        if weight_sum > 0:
            output[index] = float(np.sum(weights * gate_values[candidate]) / weight_sum)

    return output.reshape(grid_x_km.shape)


def nearest_grid(
    gate_x_km,
    gate_y_km,
    gate_values,
    grid_x_km,
    grid_y_km,
    max_range_km,
    search_radius_km,
):
    tree = cKDTree(np.column_stack([gate_x_km, gate_y_km]))
    grid_points = np.column_stack([grid_x_km.reshape(-1), grid_y_km.reshape(-1)])
    distances, indices = tree.query(grid_points, k=1, distance_upper_bound=search_radius_km)
    output = np.full(grid_points.shape[0], np.nan, dtype=float)
    valid = np.isfinite(distances) & (indices < gate_values.size)
    grid_range = np.hypot(grid_points[:, 0], grid_points[:, 1])
    valid &= grid_range <= max_range_km
    output[valid] = gate_values[indices[valid]]
    return output.reshape(grid_x_km.shape)


def polar_bilinear_grid(
    azimuth_deg,
    data,
    grid_x_km,
    grid_y_km,
    max_range_km,
    gate_resolution_km,
):
    azimuth = np.asarray(azimuth_deg, dtype=float) % 360.0
    data = np.asarray(data, dtype=float)
    order = np.argsort(azimuth)
    azimuth = azimuth[order]
    data = data[order, :]

    unique_azimuth, unique_indices = np.unique(azimuth, return_index=True)
    azimuth = unique_azimuth
    data = data[unique_indices, :]
    if azimuth.size < 2 or data.shape[1] < 2:
        return np.full(grid_x_km.shape, np.nan, dtype=float)

    # Wrap one row at 360 degrees so interpolation is continuous across north.
    azimuth_ext = np.concatenate([azimuth, [azimuth[0] + 360.0]])
    data_ext = np.vstack([data, data[0:1, :]])

    target_range = np.hypot(grid_x_km, grid_y_km)
    target_azimuth = (np.degrees(np.arctan2(grid_x_km, grid_y_km)) + 360.0) % 360.0
    range_index = target_range / gate_resolution_km - 0.5

    az_hi = np.searchsorted(azimuth_ext, target_azimuth, side='right')
    az_hi = np.clip(az_hi, 1, azimuth_ext.size - 1)
    az_lo = az_hi - 1
    az_span = azimuth_ext[az_hi] - azimuth_ext[az_lo]
    az_weight = np.divide(
        target_azimuth - azimuth_ext[az_lo],
        az_span,
        out=np.zeros_like(target_azimuth),
        where=az_span != 0,
    )

    r_lo = np.floor(range_index).astype(int)
    r_hi = r_lo + 1
    r_weight = range_index - r_lo

    valid = (
        (target_range <= max_range_km)
        & (r_lo >= 0)
        & (r_hi < data_ext.shape[1])
    )
    output = np.full(grid_x_km.shape, np.nan, dtype=float)
    if not np.any(valid):
        return output

    v00 = data_ext[az_lo[valid], r_lo[valid]]
    v01 = data_ext[az_lo[valid], r_hi[valid]]
    v10 = data_ext[az_hi[valid], r_lo[valid]]
    v11 = data_ext[az_hi[valid], r_hi[valid]]
    aw = az_weight[valid]
    rw = r_weight[valid]

    values = (
        v00 * (1 - aw) * (1 - rw)
        + v10 * aw * (1 - rw)
        + v01 * (1 - aw) * rw
        + v11 * aw * rw
    )
    finite_corners = np.isfinite(v00) & np.isfinite(v01) & np.isfinite(v10) & np.isfinite(v11)
    valid_positions = np.flatnonzero(valid)
    output.reshape(-1)[valid_positions[finite_corners]] = values[finite_corners]
    return output


def grid_by_method(
    method,
    azimuth_deg,
    polar_data,
    gate_x,
    gate_y,
    gate_values,
    grid_x,
    grid_y,
    max_range_km,
    search_radius_km,
    gate_resolution_km,
):
    if method == 'nearest':
        return nearest_grid(gate_x, gate_y, gate_values, grid_x, grid_y, max_range_km, search_radius_km)
    if method == 'polar_bilinear':
        return polar_bilinear_grid(azimuth_deg, polar_data, grid_x, grid_y, max_range_km, gate_resolution_km)
    if method == 'barnes_like':
        return barnes_like_grid(gate_x, gate_y, gate_values, grid_x, grid_y, max_range_km, search_radius_km)
    raise ValueError(f'Unknown grid method: {method}')


def plot_polar(azimuth_deg, data, output_path, title):
    cmap, norm = radar_colormap()
    range_centers = (np.arange(data.shape[1], dtype=float) + 0.5) * GATE_RESOLUTION_KM
    theta_edges = np.deg2rad(centers_to_edges(azimuth_deg))
    range_edges = centers_to_edges(range_centers)
    theta_grid, range_grid = np.meshgrid(theta_edges, range_edges, indexing='ij')

    fig, ax = plt.subplots(figsize=(10, 9), subplot_kw={'projection': 'polar'})
    mesh = ax.pcolormesh(theta_grid, range_grid, data, cmap=cmap, norm=norm, shading='flat')
    ax.set_theta_zero_location('N')
    ax.set_theta_direction(-1)
    ax.set_ylim(0, MAX_RANGE_KM)
    ax.set_title(title)
    ax.grid(True, alpha=0.35)
    cbar = fig.colorbar(mesh, ax=ax, pad=0.1, shrink=0.82)
    cbar.set_label(f'{VARIABLE} (dBZ)')
    fig.savefig(output_path, dpi=180, bbox_inches='tight')
    plt.close(fig)


def plot_latlon(latitudes, longitudes, grid_values, output_path, title):
    cmap, norm = radar_colormap()
    lat_edges = centers_to_edges(latitudes)
    lon_edges = centers_to_edges(longitudes)
    lon_grid, lat_grid = np.meshgrid(lon_edges, lat_edges)

    fig, ax = plt.subplots(figsize=(10, 9))
    mesh = ax.pcolormesh(lon_grid, lat_grid, grid_values, cmap=cmap, norm=norm, shading='flat')
    ax.scatter([RADAR_LON], [RADAR_LAT], c='black', s=22, marker='^', label='Radar')
    ax.set_aspect('equal', adjustable='box')
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    ax.set_title(title)
    ax.grid(True, alpha=0.28)
    ax.legend(loc='upper right')
    cbar = fig.colorbar(mesh, ax=ax, pad=0.02, shrink=0.82)
    cbar.set_label(f'{VARIABLE} (dBZ)')
    fig.savefig(output_path, dpi=180, bbox_inches='tight')
    plt.close(fig)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    info = find_latest_radar_file(RADAR_BASE_DIR, [PRODUCT])
    if info is None:
        raise SystemExit(f'No {PRODUCT} files found under {RADAR_BASE_DIR}')

    radar = read_ka_cma(info.path)
    product = extract_polar_product(
        radar,
        variable=VARIABLE,
        max_range_km=MAX_RANGE_KM,
        gate_resolution_km=GATE_RESOLUTION_KM,
    )
    azimuth_deg, polar_data = sort_polar_product(product)
    gate_x, gate_y, gate_values = polar_gate_points(azimuth_deg, polar_data, GATE_RESOLUTION_KM)
    latitudes, longitudes, grid_x, grid_y, range_grid = make_latlon_grid(
        RADAR_LAT,
        RADAR_LON,
        MAX_RANGE_KM,
        GRID_RESOLUTION_DEG,
    )
    stem = f'{PRODUCT}_{VARIABLE}_{info.timestamp_beijing:%Y%m%d_%H%M%S}_{info.angle}'
    polar_path = OUTPUT_DIR / f'{stem}_polar.png'

    title_suffix = (
        f'{info.path.name}\n'
        f'time={info.timestamp_beijing:%Y-%m-%d %H:%M:%S}, angle={info.angle}, '
        f'grid={GRID_RESOLUTION_DEG} deg, radius={SEARCH_RADIUS_KM} km'
    )
    plot_polar(azimuth_deg, polar_data, polar_path, f'Polar radar {title_suffix}')

    print(f'input_file={info.path}')
    print(f'polar_png={polar_path}')
    print(f'grid_shape={(len(latitudes), len(longitudes))}, lat_count={len(latitudes)}, lon_count={len(longitudes)}')

    for method in GRID_METHODS:
        grid_values = grid_by_method(
            method,
            azimuth_deg,
            polar_data,
            gate_x,
            gate_y,
            gate_values,
            grid_x,
            grid_y,
            MAX_RANGE_KM,
            SEARCH_RADIUS_KM,
            GATE_RESOLUTION_KM,
        )
        grid_values = np.where(range_grid <= MAX_RANGE_KM, grid_values, np.nan)
        grid_path = OUTPUT_DIR / f'{stem}_latlon_grid_{method}.png'
        method_title = f'Lat/Lon {method} grid {title_suffix}'
        plot_latlon(latitudes, longitudes, grid_values, grid_path, method_title)
        valid_grid = grid_values[np.isfinite(grid_values)]
        print(f'{method}_png={grid_path}')
        print(f'{method}_valid_grid_count={valid_grid.size}')
        if valid_grid.size:
            print(
                f'{method}_grid_min={np.nanmin(valid_grid):.2f}, '
                f'{method}_grid_max={np.nanmax(valid_grid):.2f}, '
                f'{method}_grid_mean={np.nanmean(valid_grid):.2f}'
            )


if __name__ == '__main__':
    main()
