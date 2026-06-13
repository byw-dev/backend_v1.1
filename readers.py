import csv
import math
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Dict, List, Optional

import config
from models import IcfpRecord, MwrRecord, ScdpRecord, TrackRecord

FALLBACK_DATA_DIR = config.SIM_OUTPUT_DIR
FALLBACK_TRACK_FILE = FALLBACK_DATA_DIR / 'track_realtime.csv'
FALLBACK_SCDP_FILE = FALLBACK_DATA_DIR / 'scdp_realtime.csv'
FALLBACK_ICFP_FILE = FALLBACK_DATA_DIR / 'icfp_realtime.csv'
FALLBACK_MWR_FILE = FALLBACK_DATA_DIR / 'mwr_realtime.txt'
DATA_SOURCE_STATE = {}


def _build_source_paths(date1: str, num: int) -> Dict[str, object]:
    date2 = date1.replace('-', '')
    return {
        'date1': date1,
        'date2': date2,
        'num': int(num),
        'track_file': Path(f'G:/B11/{date1}_{num}/{date2}_{num}_B11.csv'),
        'scdp_file': Path(f'G:/B11/{date1}_{num}/WR_SCDP/SCDP_B11_{date2}.csv'),
        'icfp_file': Path(f'G:/B11/{date1}_{num}/WR_ICFP/ICFP_{date2}_{num}_B11.csv'),
        'mwr_file': Path(f'G:/B11/{date1}_{num}/WR_YMWR/Z_UPAR_I_59134_{date2}000000_P_YMWR_TK001_CP_D.TXT'),
    }


def set_runtime_data_source(date1: str, num: int) -> Dict[str, object]:
    DATA_SOURCE_STATE.clear()
    DATA_SOURCE_STATE.update(_build_source_paths(date1, num))
    return get_runtime_data_source()


def get_runtime_data_source() -> Dict[str, object]:
    if not DATA_SOURCE_STATE:
        set_runtime_data_source(config.DATE1, config.NUM)
    return dict(DATA_SOURCE_STATE)


def get_runtime_data_source_payload() -> Dict[str, object]:
    source = get_runtime_data_source()
    return {
        'date1': source['date1'],
        'date2': source['date2'],
        'num': source['num'],
        'default_date1': config.DATE1,
        'default_date2': config.DATE2,
        'default_num': config.NUM,
        'track_file': str(source['track_file']),
        'scdp_file': str(source['scdp_file']),
        'icfp_file': str(source['icfp_file']),
        'mwr_file': str(source['mwr_file']),
        'persistent': False,
    }


def to_float(value: str) -> Optional[float]:
    value = (value or '').strip()
    if value == '' or value.lower() == 'null':
        return None
    try:
        parsed = float(value)
        if not math.isfinite(parsed):
            return None
        return parsed
    except ValueError:
        return None


def read_appended_lines(path, state, encoding='utf-8') -> List[str]:
    with open(path, 'r', encoding=encoding, errors='replace') as f:
        f.seek(state['offset'])
        chunk = f.read()
        state['offset'] = f.tell()

    text = state['partial'] + chunk
    if not text:
        return []

    if not text.endswith('\n'):
        parts = text.splitlines()
        if parts:
            state['partial'] = parts[-1]
            return parts[:-1]
        state['partial'] = text
        return []

    state['partial'] = ''
    return text.splitlines()


def read_appended_lines_if_exists(path, state, encoding='utf-8', fallback_path: Optional[Path] = None) -> List[str]:
    active_path = path
    active_source = 'primary'

    if (
        config.ALLOW_SIMULATED_FALLBACK
        and not active_path.exists()
        and fallback_path is not None
        and fallback_path.exists()
    ):
        active_path = fallback_path
        active_source = 'fallback'

    if not active_path.exists():
        if not state.get('missing_warned'):
            print(f'[readers] missing source file: {path}')
            if not config.ALLOW_SIMULATED_FALLBACK:
                print('[readers] simulated fallback disabled (business mode).')
            state['missing_warned'] = True
        state['path_exists'] = False
        state['active_source'] = None
        return []

    current_size = active_path.stat().st_size
    if state.get('offset', 0) > current_size:
        # File may be truncated/rotated in-place; reset cursor to avoid permanent stale reads.
        print(f'[readers] detected truncate/rotate, reset offset: {active_path}')
        state['offset'] = 0
        state['partial'] = ''
        state['header_done'] = False
        state['column_map'] = None

    state['missing_warned'] = False
    state['path_exists'] = True
    active_path_key = str(active_path)
    if state.get('active_path') != active_path_key:
        # Switching data source should restart incremental offsets and header parsing.
        state['offset'] = 0
        state['partial'] = ''
        state['header_done'] = False
        state['column_map'] = None
        state['active_path'] = active_path_key

    state['active_source'] = active_source
    return read_appended_lines(active_path, state, encoding=encoding)


def _csv_split(line: str) -> List[str]:
    return next(csv.reader(StringIO(line)))


def parse_track_line(line: str) -> Optional[TrackRecord]:
    if not line or line.startswith('AVP_CSV'):
        return None
    row = _csv_split(line)
    if len(row) < 16:
        return None
    try:
        date_text = row[config.TRACK_COLS['date']].strip()
        time_text = row[config.TRACK_COLS['time']].strip()
        if not date_text or not time_text:
            return None
        dt = datetime.strptime(f"{date_text} {time_text}", '%Y%m%d %H:%M:%S')
        lon = to_float(row[config.TRACK_COLS['lon']])
        lat = to_float(row[config.TRACK_COLS['lat']])
        alt_m = to_float(row[config.TRACK_COLS['alt']])
        if lon is None or lat is None or alt_m is None:
            return None
        return TrackRecord(
            time=dt,
            lon=lon,
            lat=lat,
            alt_m=alt_m,
            speed=to_float(row[config.TRACK_COLS['speed']]),
            heading=to_float(row[config.TRACK_COLS['heading']]),
        )
    except Exception:
        return None


def parse_scdp_line(line: str, column_map: Dict[str, int]) -> Optional[ScdpRecord]:
    row = _csv_split(line)
    if len(row) < 5:
        return None
    try:
        dt = datetime.strptime(row[column_map['time']].strip(), '%Y/%m/%d %H:%M:%S')
        bins = []
        for i in range(1, 31):
            bins.append(to_float(row[column_map[f'CDP Bin {i}']]))
        return ScdpRecord(
            time=dt,
            number_conc=to_float(row[column_map['Number Conc (#/cm^3)']]),
            lwc=to_float(row[column_map['LWC (g/m^3)']]),
            mvd=to_float(row[column_map['MVD (um)']]),
            ed=to_float(row[column_map['ED (um)']]),
            bins=bins,
        )
    except Exception:
        return None


def parse_icfp_line(line: str, column_map: Dict[str, int]) -> Optional[IcfpRecord]:
    row = _csv_split(line)
    if len(row) < 5:
        return None
    try:
        dt = datetime.strptime(row[column_map['time']].strip(), '%Y-%m-%d-%H:%M:%S')
        bins = []
        for i in range(1, 196):
            bins.append(to_float(row[column_map[f'Bin{i}']]))
        return IcfpRecord(
            time=dt,
            number_conc=to_float(row[column_map['Number Conc(#/cm^3)']]),
            lwc=to_float(row[column_map['LWC(g/m^3)']]),
            mvd=to_float(row[column_map['MVD(um)']]),
            ed=to_float(row[column_map['ED(um)']]),
            bins=bins,
        )
    except Exception:
        return None


def _km_col_name(level_m: int) -> str:
    return f'{level_m / 1000:.3f}(km)'


def _build_mwr_record_from_group(group: Dict) -> MwrRecord:
    return MwrRecord(
        time=group['time'],
        sur_tem=group.get('sur_tem'),
        sur_hum=group.get('sur_hum'),
        cloud_base_km=group.get('cloud_base_km'),
        vint_mm=group.get('vint_mm'),
        lqint_mm=group.get('lqint_mm'),
        levels_m=config.MWR_LEVELS_M[:],
        temperature_profile=group.get('11', [None] * len(config.MWR_LEVELS_M)),
        vapor_density_profile=group.get('12', [None] * len(config.MWR_LEVELS_M)),
        humidity_profile=group.get('13', [None] * len(config.MWR_LEVELS_M)),
        liquid_water_profile=group.get('14', [None] * len(config.MWR_LEVELS_M)),
        status='ok' if all(k in group for k in ('11', '12', '13', '14')) else 'partial',
    )


def parse_mwr_line(line: str, column_map: Dict[str, int], pending: Dict) -> Optional[MwrRecord]:
    row = _csv_split(line)
    if len(row) < 20:
        return None

    try:
        dt = datetime.strptime(row[column_map['DateTime']].strip(), '%Y-%m-%d %H:%M:%S')
        profile_type = row[column_map['type']].strip()
        if profile_type not in {'11', '12', '13', '14'}:
            return None

        profile = []
        for level_m in config.MWR_LEVELS_M:
            profile.append(to_float(row[column_map[_km_col_name(level_m)]]))

        group = pending.setdefault(dt, {
            'time': dt,
            'sur_tem': to_float(row[column_map['SurTem']]),
            'sur_hum': to_float(row[column_map['SurHum(%)']]),
            'cloud_base_km': to_float(row[column_map['CloudBase(km)']]),
            'vint_mm': to_float(row[column_map['Vint(mm)']]),
            'lqint_mm': to_float(row[column_map['Lqint(mm)']]),
        })

        group[profile_type] = profile

        if all(k in group for k in ('11', '12', '13', '14')):
            record = _build_mwr_record_from_group(group)
            pending.pop(dt, None)
            return record
    except Exception:
        return None

    return None


def flush_stale_mwr_pending(store) -> List[MwrRecord]:
    records = []
    for dt in sorted(list(store.mwr_pending.keys())):
        group = store.mwr_pending.pop(dt)
        records.append(_build_mwr_record_from_group(group))
    return records


def _build_header_map(header_row: List[str], source: str) -> Dict[str, int]:
    header_map = {}
    if source == 'scdp':
        header_map['time'] = header_row.index('Times')
        for name in ['Number Conc (#/cm^3)', 'LWC (g/m^3)', 'MVD (um)', 'ED (um)']:
            header_map[name] = header_row.index(name)
        for i in range(1, 31):
            key = f'CDP Bin {i}'
            header_map[key] = header_row.index(key)
    elif source == 'icfp':
        header_map['time'] = header_row.index('Time')
        for name in ['Number Conc(#/cm^3)', 'LWC(g/m^3)', 'MVD(um)', 'ED(um)']:
            header_map[name] = header_row.index(name)
        for i in range(1, 196):
            key = f'Bin{i}'
            header_map[key] = header_row.index(key)
    elif source == 'mwr':
        header_map['DateTime'] = header_row.index('DateTime')
        header_map['type'] = 2  # the third column named "10" in this file layout

        def find_index(prefix: str) -> int:
            for idx, cell in enumerate(header_row):
                if cell.startswith(prefix):
                    return idx
            raise ValueError(f'MWR header not found: {prefix}')

        header_map['SurTem'] = find_index('SurTem(')
        header_map['SurHum(%)'] = header_row.index('SurHum(%)')
        header_map['CloudBase(km)'] = header_row.index('CloudBase(km)')
        header_map['Vint(mm)'] = header_row.index('Vint(mm)')
        header_map['Lqint(mm)'] = header_row.index('Lqint(mm)')
        for level_m in config.MWR_LEVELS_M:
            key = _km_col_name(level_m)
            header_map[key] = header_row.index(key)
    return header_map


def _safe_build_header_map(header_row: List[str], source: str) -> Optional[Dict[str, int]]:
    try:
        return _build_header_map(header_row, source)
    except ValueError as exc:
        # Header line may appear later (or include variant labels). Keep polling instead of crashing loop.
        print(f'[readers] skip unmatched {source} header: {exc}')
        return None


def poll_track(store, arrival_at: datetime):
    state = store.file_states['track']
    source = get_runtime_data_source()
    lines = read_appended_lines_if_exists(
        source['track_file'],
        state,
        encoding='utf-8',
        fallback_path=FALLBACK_TRACK_FILE,
    )
    for line in lines:
        if not line.strip():
            continue
        record = parse_track_line(line)
        if record:
            store.put_track(record, arrival_at=arrival_at)


def poll_scdp(store):
    state = store.file_states['scdp']
    source = get_runtime_data_source()
    lines = read_appended_lines_if_exists(
        source['scdp_file'],
        state,
        encoding='utf-8',
        fallback_path=FALLBACK_SCDP_FILE,
    )
    for line in lines:
        if not line.strip():
            continue
        if not state['header_done']:
            if line.startswith('Instrument Type='):
                continue
            header_row = _csv_split(line)
            column_map = _safe_build_header_map(header_row, 'scdp')
            if column_map is None:
                continue
            state['column_map'] = column_map
            state['header_done'] = True
            continue
        record = parse_scdp_line(line, state['column_map'])
        if record:
            store.put_scdp(record)


def poll_icfp(store):
    state = store.file_states['icfp']
    records = []
    source = get_runtime_data_source()
    lines = read_appended_lines_if_exists(
        source['icfp_file'],
        state,
        encoding='utf-8',
        fallback_path=FALLBACK_ICFP_FILE,
    )
    for line in lines:
        if not line.strip():
            continue
        if not state['header_done']:
            header_row = _csv_split(line)
            column_map = _safe_build_header_map(header_row, 'icfp')
            if column_map is None:
                continue
            state['column_map'] = column_map
            state['header_done'] = True
            continue
        record = parse_icfp_line(line, state['column_map'])
        if record:
            store.put_icfp(record)
            records.append(record)
    return records


def poll_mwr(store, arrival_at: datetime) -> List[MwrRecord]:
    state = store.file_states['mwr']
    source = get_runtime_data_source()
    lines = read_appended_lines_if_exists(
        source['mwr_file'],
        state,
        encoding='utf-8',
        fallback_path=FALLBACK_MWR_FILE,
    )
    records = []
    for line in lines:
        if not line.strip():
            continue
        if not state['header_done']:
            if line.startswith('MWR,'):
                continue
            if line.startswith('53910,'):
                continue
            header_row = _csv_split(line)
            column_map = _safe_build_header_map(header_row, 'mwr')
            if column_map is None:
                continue
            state['column_map'] = column_map
            state['header_done'] = True
            continue
        record = parse_mwr_line(line, state['column_map'], store.mwr_pending)
        if record:
            store.put_mwr(record, arrival_at=arrival_at)
            records.append(record)
    return records


def finalize_mwr_pending(store, arrival_at: datetime) -> List[MwrRecord]:
    records = []
    for record in flush_stale_mwr_pending(store):
        store.put_mwr(record, arrival_at=arrival_at)
        records.append(record)
    return records


async def poll_all_sources(store):
    arrival_at = datetime.now()
    poll_track(store, arrival_at=arrival_at)
    poll_scdp(store)
    icfp_records = poll_icfp(store)
    mwr_records = poll_mwr(store, arrival_at=arrival_at)
    mwr_records.extend(finalize_mwr_pending(store, arrival_at=arrival_at))
    return {
        'arrival_at': arrival_at,
        'icfp_records': icfp_records,
        'mwr_records': mwr_records,
    }
