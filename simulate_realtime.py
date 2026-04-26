import random
import time
import csv
import argparse
import shutil
import os
import ctypes
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import StringIO
from pathlib import Path, PureWindowsPath
from typing import Callable, Dict, Iterable, List, Optional, Sequence, TypeVar

from config import (
    ICFP_FILE,
    MWR_FILE,
    MWR_SIM_INTERVAL_SEC,
    SIM_SKIP_SECONDS,
    SCDP_FILE,
    SIM_OUTPUT_DIR,
    SIM_RANDOM_JITTER_SEC,
    SOURCE_ICFP_FILE,
    SOURCE_MWR_FILE,
    SOURCE_SCDP_FILE,
    SOURCE_TRACK_FILE,
    TRACK_FILE,
    TRACK_SIM_INTERVAL_SEC,
    TRACK_COLS,
    ICFP_SIM_INTERVAL_SEC,
    SCDP_SIM_INTERVAL_SEC,
    MWR_LEVELS_M,
)


@dataclass
class StreamState:
    name: str
    target_path: Path
    headers: List[str]
    records: List[Sequence[str]]
    interval_sec: float
    cursor: int = 0

    def reset_output(self) -> None:
        self.target_path.parent.mkdir(parents=True, exist_ok=True)
        content = '\n'.join(self.headers)
        if content:
            content += '\n'
        self.target_path.write_text(content, encoding='utf-8')

    def next_record_batch(self) -> List[str]:
        if not self.records:
            return []

        item = self.records[self.cursor]
        self.cursor = (self.cursor + 1) % len(self.records)
        if isinstance(item, list):
            return list(item)
        return [str(item)]

    def append_batch(self, batch: Iterable[str]) -> int:
        lines = [line for line in batch if line is not None]
        if not lines:
            return 0
        with open(self.target_path, 'a', encoding='utf-8', newline='') as f:
            for line in lines:
                f.write(line.rstrip('\n') + '\n')
        return len(lines)


def _read_lines(path: Path) -> List[str]:
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read().splitlines()


def _read_lines_if_exists(path: Path, name: str) -> Optional[List[str]]:
    if not path.exists():
        print(f'[{name}] source missing, skip: {path}')
        return None
    return _read_lines(path)


def _csv_split(line: str) -> List[str]:
    return next(csv.reader(StringIO(line)))


def _bootstrap_dir() -> Path:
    return SIM_OUTPUT_DIR / 'source_bootstrap'


def _env_source_override(name: str) -> Optional[Path]:
    raw = os.environ.get(f'SIM_SOURCE_{name.upper()}_FILE', '').strip()
    if not raw:
        return None
    return Path(raw)


def _mapped_drive_to_unc_path(path: Path) -> Optional[Path]:
    # Windows-only: convert e.g. G:\a\b to \\server\share\a\b when mapping exists.
    if os.name != 'nt':
        return None
    p = PureWindowsPath(str(path))
    drive = p.drive
    if not drive or not drive.endswith(':'):
        return None
    try:
        buffer = ctypes.create_unicode_buffer(2048)
        size = ctypes.c_ulong(len(buffer))
        result = ctypes.windll.mpr.WNetGetConnectionW(drive, buffer, ctypes.byref(size))
        if result != 0:
            return None
        unc_root = buffer.value
        if not unc_root:
            return None
        return Path(PureWindowsPath(unc_root, *p.parts[1:]))
    except Exception:
        return None


def _resolve_preferred_source_path(name: str, preferred_path: Path) -> Path:
    # Highest priority: explicit override, useful when mapped drive is invisible in Python process.
    override = _env_source_override(name)
    if override is not None:
        if override.exists():
            print(f'[{name}] using env override source: {override}')
            return override
        print(f'[{name}] env override source not found: {override}')

    if preferred_path.exists():
        return preferred_path

    unc_path = _mapped_drive_to_unc_path(preferred_path)
    if unc_path is not None and unc_path.exists():
        print(f'[{name}] mapped drive fallback -> UNC: {unc_path}')
        return unc_path
    return preferred_path


def _make_scdp_header() -> str:
    fields = ['Times', 'Number Conc (#/cm^3)', 'LWC (g/m^3)', 'MVD (um)', 'ED (um)']
    fields.extend([f'CDP Bin {i}' for i in range(1, 31)])
    return ','.join(fields)


def _make_icfp_header() -> str:
    fields = ['Time', 'Number Conc(#/cm^3)', 'LWC(g/m^3)', 'MVD(um)', 'ED(um)']
    fields.extend([f'Bin{i}' for i in range(1, 196)])
    return ','.join(fields)


def _make_mwr_header() -> str:
    fields = ['DateTime', 'Station', '10', 'CloudBase(km)', 'Lqint(mm)', 'Vint(mm)', 'SurHum(%)', 'SurTem(C)']
    fields.extend([f'{level_m / 1000:.3f}(km)' for level_m in MWR_LEVELS_M])
    return ','.join(fields)


def _has_payload_data(name: str, path: Path) -> bool:
    try:
        lines = _read_lines(path)
    except Exception:
        return False
    if name == 'track':
        return any(line.strip() and not line.startswith('AVP_CSV') for line in lines)
    if name == 'scdp':
        header_done = False
        for line in lines:
            if not line.strip():
                continue
            if not header_done:
                if not line.startswith('Instrument Type='):
                    header_done = True
                continue
            return True
        return False
    if name == 'icfp':
        seen_header = False
        for line in lines:
            if not line.strip():
                continue
            if not seen_header:
                seen_header = True
                continue
            return True
        return False
    if name == 'mwr':
        for line in lines:
            if not line.strip() or line.startswith('MWR,') or line.startswith('53910,'):
                continue
            row = _csv_split(line)
            if _parse_mwr_datetime_from_row(row) is not None:
                return True
        return False
    return bool(lines)


def _ensure_source_file(
    name: str,
    preferred_path: Path,
    fallback_realtime_path: Path,
    template_headers: List[str],
    bootstrap_filename: str,
) -> Optional[Path]:
    preferred_path = _resolve_preferred_source_path(name, preferred_path)
    if preferred_path.exists():
        return preferred_path

    bootstrap_path = _bootstrap_dir() / bootstrap_filename
    bootstrap_path.parent.mkdir(parents=True, exist_ok=True)

    if fallback_realtime_path.exists() and fallback_realtime_path.stat().st_size > 0:
        if _has_payload_data(name, fallback_realtime_path):
            try:
                shutil.copy2(fallback_realtime_path, bootstrap_path)
                print(f'[{name}] source missing, bootstrapped from realtime file: {bootstrap_path}')
                return bootstrap_path
            except Exception as exc:
                print(f'[{name}] bootstrap copy failed ({exc}), fallback to realtime file: {fallback_realtime_path}')
                return fallback_realtime_path
        print(f'[{name}] source missing and fallback realtime has header only: {fallback_realtime_path}')

    content = '\n'.join(template_headers)
    if content:
        content += '\n'
    bootstrap_path.write_text(content, encoding='utf-8')
    print(f'[{name}] source missing, created template source: {bootstrap_path}')
    return bootstrap_path


def _resolve_source_paths() -> Dict[str, Path]:
    resolved: Dict[str, Path] = {}
    source_defs = [
        ('track', SOURCE_TRACK_FILE, TRACK_FILE, ['AVP_CSV'], 'track_source.csv'),
        ('scdp', SOURCE_SCDP_FILE, SCDP_FILE, ['Instrument Type=Simulator', _make_scdp_header()], 'scdp_source.csv'),
        ('icfp', SOURCE_ICFP_FILE, ICFP_FILE, [_make_icfp_header()], 'icfp_source.csv'),
        ('mwr', SOURCE_MWR_FILE, MWR_FILE, ['MWR,Simulator', '53910,Simulator', _make_mwr_header()], 'mwr_source.txt'),
    ]
    for name, preferred, realtime, headers, bootstrap_name in source_defs:
        path = _ensure_source_file(name, preferred, realtime, headers, bootstrap_name)
        if path is None:
            continue
        resolved[name] = path
    return resolved


def _build_track_stream(source_path: Path, skip_seconds: int) -> Optional[StreamState]:
    lines = _read_lines_if_exists(source_path, 'track')
    if lines is None:
        return None
    headers = [line for line in lines if line.startswith('AVP_CSV')]
    records = [line for line in lines if line.strip() and not line.startswith('AVP_CSV')]
    if skip_seconds > 0:
        records = _skip_items_by_seconds(records, _track_time_from_line, skip_seconds)
    return StreamState(
        name='track',
        target_path=TRACK_FILE,
        headers=headers,
        records=records,
        interval_sec=TRACK_SIM_INTERVAL_SEC,
    )


def _build_scdp_stream(source_path: Path, skip_seconds: int) -> Optional[StreamState]:
    lines = _read_lines_if_exists(source_path, 'scdp')
    if lines is None:
        return None
    headers: List[str] = []
    records: List[str] = []
    header_done = False
    for line in lines:
        if not line.strip():
            continue
        if not header_done:
            headers.append(line)
            if not line.startswith('Instrument Type='):
                header_done = True
            continue
        records.append(line)
    if skip_seconds > 0:
        time_index = _header_index_from_csv_row(headers[-1] if headers else '', 'Times')
        records = _skip_items_by_seconds(
            records,
            lambda line: _scdp_time_from_line(line, time_index),
            skip_seconds,
        )

    return StreamState(
        name='scdp',
        target_path=SCDP_FILE,
        headers=headers,
        records=records,
        interval_sec=SCDP_SIM_INTERVAL_SEC,
    )


def _build_icfp_stream(source_path: Path, skip_seconds: int) -> Optional[StreamState]:
    lines = _read_lines_if_exists(source_path, 'icfp')
    if lines is None:
        return None
    headers = []
    records = []
    header_done = False
    for line in lines:
        if not line.strip():
            continue
        if not header_done:
            headers.append(line)
            header_done = True
            continue
        records.append(line)
    if skip_seconds > 0:
        time_index = _header_index_from_csv_row(headers[-1] if headers else '', 'Time')
        records = _skip_items_by_seconds(
            records,
            lambda line: _icfp_time_from_line(line, time_index),
            skip_seconds,
        )

    return StreamState(
        name='icfp',
        target_path=ICFP_FILE,
        headers=headers,
        records=records,
        interval_sec=ICFP_SIM_INTERVAL_SEC,
    )


def _build_mwr_stream(source_path: Path, skip_seconds: int) -> Optional[StreamState]:
    lines = _read_lines_if_exists(source_path, 'mwr')
    if lines is None:
        return None
    headers: List[str] = []
    grouped_records: List[List[str]] = []
    current_group: List[str] = []
    current_dt = None
    header_done = False

    for line in lines:
        if not line.strip():
            continue
        if not header_done:
            headers.append(line)
            if not line.startswith('MWR,') and not line.startswith('53910,'):
                header_done = True
            continue

        row = _csv_split(line)
        row_dt = _parse_mwr_datetime_from_row(row)
        if row_dt is None:
            continue
        if current_dt is None:
            current_dt = row_dt
        if row_dt != current_dt:
            grouped_records.append(current_group)
            current_group = []
            current_dt = row_dt
        current_group.append(line)

    if current_group:
        grouped_records.append(current_group)

    if skip_seconds > 0:
        grouped_records = _skip_items_by_seconds(
            grouped_records,
            _mwr_group_time,
            skip_seconds,
        )

    return StreamState(
        name='mwr',
        target_path=MWR_FILE,
        headers=headers,
        records=grouped_records,
        interval_sec=MWR_SIM_INTERVAL_SEC,
    )


def _build_streams(source_paths: Dict[str, Path], skip_seconds: int) -> List[StreamState]:
    streams: List[StreamState] = []
    builders = (
        lambda: _build_track_stream(source_paths['track'], skip_seconds) if 'track' in source_paths else None,
        lambda: _build_scdp_stream(source_paths['scdp'], skip_seconds) if 'scdp' in source_paths else None,
        lambda: _build_icfp_stream(source_paths['icfp'], skip_seconds) if 'icfp' in source_paths else None,
        lambda: _build_mwr_stream(source_paths['mwr'], skip_seconds) if 'mwr' in source_paths else None,
    )
    for builder in builders:
        stream = builder()
        if stream is None:
            continue
        streams.append(stream)
    return streams


def _track_time_from_line(line: str) -> Optional[datetime]:
    try:
        row = next(csv.reader(StringIO(line)))
        date_text = row[TRACK_COLS['date']].strip()
        time_text = row[TRACK_COLS['time']].strip()
        if not date_text or not time_text:
            return None
        return datetime.strptime(f'{date_text} {time_text}', '%Y%m%d %H:%M:%S')
    except Exception:
        return None


def _header_index_from_csv_row(header_line: str, key: str) -> Optional[int]:
    try:
        header_row = next(csv.reader(StringIO(header_line)))
        return header_row.index(key)
    except Exception:
        return None


def _scdp_time_from_line(line: str, time_index: Optional[int]) -> Optional[datetime]:
    if time_index is None:
        return None
    try:
        row = next(csv.reader(StringIO(line)))
        return datetime.strptime(row[time_index].strip(), '%Y/%m/%d %H:%M:%S')
    except Exception:
        return None


def _icfp_time_from_line(line: str, time_index: Optional[int]) -> Optional[datetime]:
    if time_index is None:
        return None
    try:
        row = next(csv.reader(StringIO(line)))
        return datetime.strptime(row[time_index].strip(), '%Y-%m-%d-%H:%M:%S')
    except Exception:
        return None


def _parse_mwr_datetime_from_row(row: Sequence[str]) -> Optional[datetime]:
    # Real source often uses "Record,DateTime,10,...", so DateTime may not be col0.
    for cell in row:
        text = (cell or '').strip()
        if not text:
            continue
        try:
            return datetime.strptime(text, '%Y-%m-%d %H:%M:%S')
        except Exception:
            continue
    return None


def _mwr_group_time(group: Sequence[str]) -> Optional[datetime]:
    if not group:
        return None
    try:
        row = next(csv.reader(StringIO(group[0])))
        return _parse_mwr_datetime_from_row(row)
    except Exception:
        return None


T = TypeVar('T')


def _skip_items_by_seconds(
    items: List[T],
    extract_dt: Callable[[T], Optional[datetime]],
    skip_seconds: int,
) -> List[T]:
    if not items:
        return items
    first_dt = extract_dt(items[0])
    if first_dt is None:
        # Fallback: assume ~1 Hz if timestamp parse fails.
        return items[min(skip_seconds, len(items)):]

    threshold = first_dt + timedelta(seconds=skip_seconds)
    kept: List[T] = []
    for item in items:
        dt = extract_dt(item)
        if dt is None:
            continue
        if dt >= threshold:
            kept.append(item)
    return kept


def _next_sleep(base_interval_sec: float) -> float:
    if SIM_RANDOM_JITTER_SEC <= 0:
        return base_interval_sec
    jitter = random.uniform(-SIM_RANDOM_JITTER_SEC, SIM_RANDOM_JITTER_SEC)
    return max(0.05, base_interval_sec + jitter)


def _build_mwr_schedule(groups: List[Sequence[str]]) -> Dict[str, List[List[str]]]:
    # Key groups by HH:MM:SS so MWR updates are triggered by second-level clock matching.
    schedule: Dict[str, List[List[str]]] = {}
    for group in groups:
        group_lines = list(group)
        if not group_lines:
            continue
        dt = _mwr_group_time(group_lines)
        if dt is None:
            continue
        key = dt.strftime('%H:%M:%S')
        schedule.setdefault(key, []).append(group_lines)
    return schedule


def _first_mwr_time(groups: List[Sequence[str]]) -> Optional[datetime]:
    for group in groups:
        dt = _mwr_group_time(group)
        if dt is not None:
            return dt
    return None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Simulate realtime source files for readers.py')
    parser.add_argument(
        '-m',
        '--skip-seconds',
        '--track-skip-seconds',
        type=int,
        default=SIM_SKIP_SECONDS,
        help='Skip first M seconds of source data before replay (default from config).',
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    skip_seconds = max(0, args.skip_seconds)
    source_paths = _resolve_source_paths()
    streams = _build_streams(source_paths, skip_seconds)
    if not streams:
        print('No valid source files found. Simulator will not start.')
        return

    SIM_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for stream in streams:
        stream.reset_output()

    next_emit_at: Dict[str, float] = {
        stream.name: time.monotonic() for stream in streams
    }
    mwr_stream = next((stream for stream in streams if stream.name == 'mwr'), None)
    mwr_schedule: Dict[str, List[List[str]]] = {}
    mwr_schedule_cursor: Dict[str, int] = {}
    mwr_sim_clock: Optional[datetime] = None
    mwr_last_tick_sec: Optional[int] = None
    if mwr_stream is not None:
        mwr_schedule = _build_mwr_schedule(mwr_stream.records)
        mwr_schedule_cursor = {key: 0 for key in mwr_schedule}
        first_dt = _first_mwr_time(mwr_stream.records)
        if first_dt is not None:
            # Simulated clock starts from first source timestamp and then advances every wall second.
            mwr_sim_clock = first_dt.replace(microsecond=0)
            mwr_last_tick_sec = int(time.time()) - 1
        print(f'[mwr] schedule keys: {len(mwr_schedule)}')

    print('Realtime simulator started.')
    print(f'Output directory: {SIM_OUTPUT_DIR.resolve()}')
    print(f'Bootstrap source directory: {_bootstrap_dir().resolve()}')
    print(f'Skip seconds (M): {skip_seconds}')
    print('Active streams:', ', '.join(stream.name for stream in streams))
    print('Press Ctrl+C to stop.')

    try:
        while True:
            now = time.monotonic()
            emitted = False
            for stream in streams:
                if stream.name == 'mwr':
                    if mwr_sim_clock is None or mwr_last_tick_sec is None:
                        continue
                    current_tick_sec = int(time.time())
                    if current_tick_sec <= mwr_last_tick_sec:
                        continue

                    while mwr_last_tick_sec < current_tick_sec:
                        mwr_last_tick_sec += 1
                        mwr_sim_clock = mwr_sim_clock + timedelta(seconds=1)
                        current_hms = mwr_sim_clock.strftime('%H:%M:%S')
                        groups = mwr_schedule.get(current_hms)
                        if not groups:
                            continue
                        cursor = mwr_schedule_cursor[current_hms]
                        batch = groups[cursor]
                        mwr_schedule_cursor[current_hms] = (cursor + 1) % len(groups)
                        count = stream.append_batch(batch)
                        emitted = True
                        if count:
                            print(
                                f'[{stream.name}] appended {count} line(s) at {current_hms} '
                                f'-> {stream.target_path}'
                            )
                    continue

                if now < next_emit_at[stream.name]:
                    continue
                batch = stream.next_record_batch()
                count = stream.append_batch(batch)
                next_emit_at[stream.name] = now + _next_sleep(stream.interval_sec)
                emitted = True
                if count:
                    print(f'[{stream.name}] appended {count} line(s) -> {stream.target_path}')
            if not emitted:
                time.sleep(0.05)
    except KeyboardInterrupt:
        print('\nRealtime simulator stopped.')


if __name__ == '__main__':
    main()
