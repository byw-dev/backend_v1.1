import math
import re
import struct
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path

import numpy as np


CHANNEL_MAP = {
    1: 'Z1',
    2: 'V1',
    3: 'W1',
    4: 'SNR1',
    7: 'dBt',
    17: 'Z2',
    18: 'V2',
    19: 'W2',
    20: 'SNR2',
    32: 'RHV',
    33: 'ZDR',
    34: 'LDR',
    35: 'CCC',
    36: 'PDP',
    37: 'KDP',
    6: 'Zc1',
    22: 'Zc2',
    38: 'Re',
    39: 'VIL',
    41: 'SQI',
    42: 'CPA',
    43: 'CF1',
    44: 'CP',
    45: 'Melting_layer',
    46: 'CN2',
    47: 'CF2',
    52: 'CHCL',
    54: 'VAV',
    55: 'CCL',
    56: 'IWC',
    57: 'PTFV',
}

FILENAME_PATTERNS = [
    (re.compile(r'(\d{8}_\d{6})\.00\.000\.010_(\d+\.\d{2})_R0\.zip$', re.I), False),
    (re.compile(r'Z_RADA_I_ST001_(\d{14})_O_YCSR_YLUKA1_(PPI|RPI)_(\d+)\.BIN\.zip$', re.I), True),
    (re.compile(r'Z_RADA_I_59754_(\d{14})_O_YCSR_YLUKA1_(PPI|RPI)_(\d+)\.BIN\.zip$', re.I), True),
]


@dataclass
class RadarFileInfo:
    path: Path
    product: str
    angle: str
    timestamp_utc: datetime
    timestamp_beijing: datetime


def parse_radar_filename(path):
    name = Path(path).name
    for pattern, add_utc8 in FILENAME_PATTERNS:
        match = pattern.search(name)
        if not match:
            continue
        timestamp_text = match.group(1).replace('_', '')
        if len(match.groups()) >= 3:
            product = match.group(2).upper()
            angle = match.group(3)
        else:
            product = 'RPI'
            angle = match.group(2).replace('.', '')
        timestamp_utc = datetime.strptime(timestamp_text, '%Y%m%d%H%M%S')
        timestamp_beijing = timestamp_utc + timedelta(hours=8) if add_utc8 else timestamp_utc
        return RadarFileInfo(
            path=Path(path),
            product=product,
            angle=angle,
            timestamp_utc=timestamp_utc,
            timestamp_beijing=timestamp_beijing,
        )
    return None


def list_radar_files(base_dir, products):
    base = Path(base_dir)
    product_set = {str(item).upper() for item in products}
    files = []
    for product in product_set:
        subdir = base / f'{product}CMA'
        if not subdir.exists():
            continue
        for path in subdir.glob('*.zip'):
            info = parse_radar_filename(path)
            if info and info.product in product_set:
                files.append(info)
    files.sort(key=lambda item: item.timestamp_beijing)
    return files


def find_latest_radar_file(base_dir, products):
    files = list_radar_files(base_dir, products)
    return files[-1] if files else None


def _open_radar_bytes(path):
    path = Path(path)
    data = path.read_bytes()
    if path.suffix.lower() != '.zip':
        return BytesIO(data)
    with zipfile.ZipFile(BytesIO(data), 'r') as archive:
        names = [name for name in archive.namelist() if not name.endswith('/')]
        if not names:
            raise ValueError(f'Empty radar zip: {path}')
        return BytesIO(archive.read(names[0]))


def _read_exact(fid, size):
    data = fid.read(size)
    if len(data) != size:
        raise EOFError(f'Incomplete radar binary block: expected {size}, got {len(data)}')
    return data


def _fread_common_block(fid):
    common = {}
    data = struct.unpack('<i h h i 20x', _read_exact(fid, 32))
    common['tagGenericHeader'] = {
        'MagicNumber': data[0],
        'MajorVersion': data[1],
        'MinorVersion': data[2],
        'GenericType': data[3],
    }

    data = struct.unpack('<8s 24s 5f 2h 6s 10x', _read_exact(fid, 72))
    common['tagSiteConfig'] = {
        'SiteCode': data[0].decode('ascii', errors='ignore').strip('\x00'),
        'SiteName': data[1].decode('ascii', errors='ignore').strip('\x00'),
        'Latitude': data[2],
        'Longitude': data[3],
        'AntennaHeight': data[4],
        'GroundHeight': data[5],
        'AmendNorth': data[6],
        'RDAVersion': data[7],
        'RadarType': data[8],
        'Manufacturers': data[9].decode('ascii', errors='ignore').strip('\x00'),
    }

    data = struct.unpack('<12f I 2h 96x', _read_exact(fid, 152))
    common['tagRadarConfig'] = {
        'Frequency': data[0],
        'Wavelength': data[1],
        'BeamWidthHori': data[2],
        'BeamWidthVert': data[3],
        'Transmitterpeakpower': data[4],
        'Antennagain': data[5],
        'Totalloss': data[6],
        'Receivergain': data[7],
        'Firstside': data[8],
        'Receiverlineardynamicrange': data[9],
        'Receiversensitivity': data[10],
        'Bandwidth': data[11],
        'Maximumdetectablerange': data[12],
        'Distancesolution': data[13],
        'PolarizationType': data[14],
    }

    data = struct.unpack('<16s 96s 2h 4i Q i f 2f 12f 4B 4H 4B 4I 20x', _read_exact(fid, 256))
    common['tagTaskConfig'] = {
        'TaskName': data[0].decode('ascii', errors='ignore').strip('\x00'),
        'TaskDescription': data[1].decode('ascii', errors='ignore').strip('\x00'),
        'ScanType': data[3],
        'ScanStartTime': data[8],
        'CutNumber': data[9],
    }

    cut_number = common['tagTaskConfig']['CutNumber']
    common['tagCutConfig'] = []
    for _ in range(cut_number):
        data = struct.unpack('<2h 4f 2h 6f i i i i 2f i 7f 12s 5i 12s 2i 4h 92x', _read_exact(fid, 256))
        common['tagCutConfig'].append({
            'Azimuth': data[8],
            'Elevation': data[9],
            'StartAngle': data[10],
            'EndAngle': data[11],
            'AngularResolution': data[12],
            'StartRange': data[16],
        })
    return common


def _fread_radial_header(fid):
    raw = fid.read(64)
    if not raw:
        return None
    if len(raw) != 64:
        raise EOFError('Incomplete radar radial header')
    data = struct.unpack('<2h 4H 2f Q 2I 2H 24x', raw)
    return {
        'RadialState': data[0],
        'MomentNumber': data[4],
        'ElevationNumber': data[5],
        'Azimuth': data[6],
        'Elevation': data[7],
        'Seconds': data[8],
    }


def _fread_moment_header(fid):
    data = struct.unpack('<5H h i 16x', _read_exact(fid, 32))
    return {
        'DataType': data[0],
        'Scale': data[1],
        'Offset': data[2],
        'BinBytes': data[3],
        'BinNumber': data[4],
    }


def _fread_real_data(fid, header):
    bin_number = int(header['BinNumber'])
    bin_bytes = int(header['BinBytes'])
    offset = header['Offset']
    scale = header['Scale'] or 1
    if bin_number <= 0:
        return np.array([], dtype=np.float32)
    if bin_bytes == 1:
        raw = np.frombuffer(_read_exact(fid, bin_number), dtype=np.uint8)
    elif bin_bytes == 2:
        raw = np.frombuffer(_read_exact(fid, bin_number * 2), dtype='<u2')
    else:
        fid.seek(bin_number * bin_bytes, 1)
        return np.array([], dtype=np.float32)
    return ((raw.astype(np.float32) - offset) / scale).astype(np.float32)


def read_ka_cma(path):
    with _open_radar_bytes(path) as fid:
        magic = fid.read(16)
        fid.seek(0)
        if magic[2:9] == b'YW-MMCR':
            raise ValueError(f'Unsupported YW-MMCR radar format: {path}')

        common = _fread_common_block(fid)
        cut_number = int(common['tagTaskConfig']['CutNumber'])
        if cut_number <= 0 or cut_number > 64:
            raise ValueError(f'Invalid radar CutNumber={cut_number}: {path}')

        records = []
        while True:
            header = _fread_radial_header(fid)
            if header is None:
                break
            moment_number = int(header['MomentNumber'])
            if moment_number < 0 or moment_number > 32:
                raise ValueError(f'Invalid radar MomentNumber={moment_number}: {path}')
            for _ in range(moment_number):
                moment = _fread_moment_header(fid)
                values = _fread_real_data(fid, moment)
                records.append({
                    'cut': int(header['ElevationNumber']),
                    'azimuth': float(header['Azimuth']),
                    'elevation': float(header['Elevation']),
                    'seconds': int(header['Seconds']),
                    'product_id': int(moment['DataType']),
                    'values': values,
                })

    return {
        'CommonBlock': common,
        'records': records,
    }


def extract_polar_product(radar, variable='Z2', max_range_km=50.0, gate_resolution_km=0.03):
    product_ids = {name: prod_id for prod_id, name in CHANNEL_MAP.items()}
    product_id = product_ids.get(variable)
    if product_id is None:
        raise ValueError(f'Unknown radar variable: {variable}')

    matching = [item for item in radar['records'] if item['product_id'] == product_id and item['values'].size]
    if not matching and variable == 'Z2':
        product_id = product_ids['Z1']
        variable = 'Z1'
        matching = [item for item in radar['records'] if item['product_id'] == product_id and item['values'].size]
    if not matching:
        raise ValueError(f'Radar variable not found: {variable}')

    cut_order = sorted({item['cut'] for item in matching})
    first_cut = cut_order[0]
    cut_records = [item for item in matching if item['cut'] == first_cut]
    cut_records.sort(key=lambda item: item['azimuth'] % 360)

    max_gates = max(1, int(max_range_km / gate_resolution_km))
    azimuth = np.array([item['azimuth'] % 360 for item in cut_records], dtype=np.float32)
    data = np.full((len(cut_records), max_gates), np.nan, dtype=np.float32)
    elevations = []
    for row_index, item in enumerate(cut_records):
        values = item['values'][:max_gates]
        if values.size:
            data[row_index, :values.size] = values
        elevations.append(item['elevation'])
    data = np.where(data <= -51, np.nan, data)
    return {
        'variable': variable,
        'azimuth': azimuth,
        'data': data,
        'elevation': float(np.nanmedian(elevations)) if elevations else None,
    }


def _nanmean_blocks(data, row_step, col_step):
    rows = []
    for row_start in range(0, data.shape[0], row_step):
        row_block = data[row_start:row_start + row_step]
        cols = []
        for col_start in range(0, data.shape[1], col_step):
            block = row_block[:, col_start:col_start + col_step]
            finite = block[np.isfinite(block)]
            cols.append(float(finite.mean()) if finite.size else None)
        rows.append(cols)
    return rows


def build_local_radar_payload(
    base_dir,
    products=('PPI', 'RPI'),
    variable='Z2',
    max_range_km=50.0,
    gate_resolution_km=0.03,
    range_bin_km=0.3,
    azimuth_step_deg=2.0,
    radar_lat=None,
    radar_lon=None,
):
    info = find_latest_radar_file(base_dir, products)
    if info is None:
        return {
            'available': False,
            'error': f'No radar files found in {base_dir}',
            'base_dir': str(base_dir),
            'products': list(products),
        }

    radar = read_ka_cma(info.path)
    product = extract_polar_product(radar, variable=variable, max_range_km=max_range_km, gate_resolution_km=gate_resolution_km)
    azimuth = product['azimuth']
    data = product['data']

    sort_index = np.argsort(azimuth)
    azimuth = azimuth[sort_index]
    data = data[sort_index, :]

    row_step = max(1, int(round(azimuth_step_deg / max(0.01, float(np.nanmedian(np.diff(azimuth))) if len(azimuth) > 1 else azimuth_step_deg))))
    col_step = max(1, int(round(range_bin_km / gate_resolution_km)))
    sampled_azimuth = azimuth[::row_step].astype(float).tolist()
    sampled_ranges = [round((idx + 0.5) * gate_resolution_km, 3) for idx in range(0, data.shape[1], col_step)]
    sampled_values = _nanmean_blocks(data, row_step=row_step, col_step=col_step)

    finite_values = data[np.isfinite(data)]
    site = radar.get('CommonBlock', {}).get('tagSiteConfig', {})
    return {
        'available': True,
        'path': str(info.path),
        'filename': info.path.name,
        'scan_product': info.product,
        'angle': info.angle,
        'scan_time': info.timestamp_beijing.isoformat(),
        'scan_time_utc': info.timestamp_utc.isoformat(),
        'variable': product['variable'],
        'elevation': product['elevation'],
        'radar': {
            'lat': radar_lat if radar_lat is not None else site.get('Latitude'),
            'lon': radar_lon if radar_lon is not None else site.get('Longitude'),
            'site_name': site.get('SiteName') or 'local radar',
        },
        'max_range_km': max_range_km,
        'gate_resolution_km': gate_resolution_km,
        'range_bin_km': col_step * gate_resolution_km,
        'azimuth_step_deg': azimuth_step_deg,
        'azimuths_deg': sampled_azimuth,
        'ranges_km': sampled_ranges,
        'values': sampled_values,
        'stats': {
            'min': float(finite_values.min()) if finite_values.size else None,
            'max': float(finite_values.max()) if finite_values.size else None,
            'mean': float(finite_values.mean()) if finite_values.size else None,
            'valid_count': int(finite_values.size),
        },
    }
