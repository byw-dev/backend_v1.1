from typing import Optional

from config import ICFP_LOOKBACK_SEC, MWR_LEVELS_M
from models import AlignedFrame, ModuleValue, MwrRecord
from mwr_saturation import identify_saturated_zones


def _default_scdp_data():
    return {
        'number_conc': None,
        'lwc': None,
        'mvd': None,
        'ed': None,
        'bins': None,
    }


def _default_icfp_data():
    return {
        'number_conc': None,
        'lwc': None,
        'mvd': None,
        'ed': None,
        'bins': None,
    }


def _default_mwr_data():
    return {
        'sur_tem': None,
        'sur_hum': None,
        'cloud_base_km': None,
        'vint_mm': None,
        'lqint_mm': None,
        'levels_m': MWR_LEVELS_M[:],
        'temperature_profile': [None] * len(MWR_LEVELS_M),
        'vapor_density_profile': [None] * len(MWR_LEVELS_M),
        'humidity_profile': [None] * len(MWR_LEVELS_M),
        'liquid_water_profile': [None] * len(MWR_LEVELS_M),
        'saturated_zone': identify_saturated_zones(
            MWR_LEVELS_M,
            [None] * len(MWR_LEVELS_M),
            [None] * len(MWR_LEVELS_M),
        ),
    }


def _mwr_module_value(t, mwr_record: Optional[MwrRecord], source_time, age_sec):
    if mwr_record is None:
        return ModuleValue(status='missing', data=_default_mwr_data())

    status = 'ok' if age_sec == 0 else 'stale_hold'
    if mwr_record.status == 'partial':
        status = 'partial' if age_sec == 0 else 'stale_hold'

    return ModuleValue(
        status=status,
        data={
            'sur_tem': mwr_record.sur_tem,
            'sur_hum': mwr_record.sur_hum,
            'cloud_base_km': mwr_record.cloud_base_km,
            'vint_mm': mwr_record.vint_mm,
            'lqint_mm': mwr_record.lqint_mm,
            'levels_m': mwr_record.levels_m,
            'temperature_profile': mwr_record.temperature_profile,
            'vapor_density_profile': mwr_record.vapor_density_profile,
            'humidity_profile': mwr_record.humidity_profile,
            'liquid_water_profile': mwr_record.liquid_water_profile,
            'saturated_zone': identify_saturated_zones(
                mwr_record.levels_m,
                mwr_record.temperature_profile,
                mwr_record.humidity_profile,
            ),
        },
        source_time=source_time,
        age_sec=age_sec,
    )


def _latest_icfp_before_or_at(t, store, lookback_sec: int):
    for it in reversed(list(store.icfp_store.keys())):
        if it <= t:
            age_sec = int((t - it).total_seconds())
            if age_sec <= lookback_sec:
                return store.icfp_store[it], it.isoformat(), age_sec
            break
    return None, None, None


def align_one_time(t, store, mwr_hold_sec: int = 15, icfp_lookback_sec: int = ICFP_LOOKBACK_SEC):
    track = store.track_store.get(t)
    if track is None:
        return None

    scdp = store.scdp_store.get(t)
    icfp, icfp_source_time, icfp_age_sec = _latest_icfp_before_or_at(t, store, icfp_lookback_sec)

    mwr_record = None
    mwr_source_time = None
    age_sec = None

    for mt in reversed(list(store.mwr_store.keys())):
        if mt <= t:
            diff = int((t - mt).total_seconds())
            if diff <= mwr_hold_sec:
                mwr_record = store.mwr_store[mt]
                mwr_source_time = mt.isoformat()
                age_sec = diff
            break

    frame = AlignedFrame(
        time=t,
        track=ModuleValue(
            status='ok',
            data={
                'lon': track.lon,
                'lat': track.lat,
                'alt_m': track.alt_m,
                'speed': track.speed,
                'heading': track.heading,
            },
        ),
        scdp=ModuleValue(
            status='ok' if scdp else 'missing',
            data=_default_scdp_data() if scdp is None else {
                'number_conc': scdp.number_conc,
                'lwc': scdp.lwc,
                'mvd': scdp.mvd,
                'ed': scdp.ed,
                'bins': scdp.bins,
            },
        ),
        icfp=ModuleValue(
            status='ok' if icfp else 'missing',
            data=_default_icfp_data() if icfp is None else {
                'number_conc': icfp.number_conc,
                'lwc': icfp.lwc,
                'mvd': icfp.mvd,
                'ed': icfp.ed,
                'bins': icfp.bins,
            },
            source_time=icfp_source_time,
            age_sec=icfp_age_sec,
        ),
        mwr=_mwr_module_value(t, mwr_record, mwr_source_time, age_sec),
    )
    return frame
