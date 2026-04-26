import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class TrackRecord:
    time: datetime
    lon: float
    lat: float
    alt_m: float
    speed: Optional[float] = None
    heading: Optional[float] = None


@dataclass
class ScdpRecord:
    time: datetime
    number_conc: Optional[float]
    lwc: Optional[float]
    mvd: Optional[float]
    ed: Optional[float]
    bins: Optional[List[float]] = None


@dataclass
class IcfpRecord:
    time: datetime
    number_conc: Optional[float]
    lwc: Optional[float]
    mvd: Optional[float]
    ed: Optional[float]
    bins: Optional[List[float]] = None


@dataclass
class MwrRecord:
    time: datetime
    sur_tem: Optional[float]
    sur_hum: Optional[float]
    cloud_base_km: Optional[float]
    vint_mm: Optional[float]
    lqint_mm: Optional[float]
    levels_m: List[int]
    temperature_profile: List[Optional[float]]
    vapor_density_profile: List[Optional[float]]
    humidity_profile: List[Optional[float]]
    liquid_water_profile: List[Optional[float]]
    status: str = 'ok'


@dataclass
class ModuleValue:
    status: str
    data: Optional[Dict[str, Any]] = None
    source_time: Optional[str] = None
    age_sec: Optional[int] = None


@dataclass
class AlignedFrame:
    time: datetime
    track: ModuleValue
    scdp: ModuleValue
    icfp: ModuleValue
    mwr: ModuleValue

    @staticmethod
    def _json_safe(value: Any) -> Any:
        if isinstance(value, float):
            return value if math.isfinite(value) else None
        if isinstance(value, dict):
            return {k: AlignedFrame._json_safe(v) for k, v in value.items()}
        if isinstance(value, list):
            return [AlignedFrame._json_safe(v) for v in value]
        return value

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            'time': self.time.isoformat(),
            'track': {
                'status': self.track.status,
                'data': self.track.data,
                'source_time': self.track.source_time,
                'age_sec': self.track.age_sec,
            },
            'scdp': {
                'status': self.scdp.status,
                'data': self.scdp.data,
                'source_time': self.scdp.source_time,
                'age_sec': self.scdp.age_sec,
            },
            'icfp': {
                'status': self.icfp.status,
                'data': self.icfp.data,
                'source_time': self.icfp.source_time,
                'age_sec': self.icfp.age_sec,
            },
            'mwr': {
                'status': self.mwr.status,
                'data': self.mwr.data,
                'source_time': self.mwr.source_time,
                'age_sec': self.mwr.age_sec,
            },
        }
        return self._json_safe(payload)
