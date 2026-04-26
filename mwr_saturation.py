import math
from typing import Dict, List, Optional


# Reference logic is adapted from reference/watervapor_saturated_zone.py.
# Here we only keep the identification part for the existing 0-1 km MWR profiles.
RH_THRESHOLD = 85.0

# Zone code meanings follow the reference script's 3-category classification.
ZONE_LABELS = {
    -1: 'filled_no_data',
    0: 'no_cloud',
    1: 'e_gt_es_and_es_gt_ei',
    2: 'es_gt_e_and_e_gt_ei',
    3: 'es_gt_ei_and_ei_gt_e',
}


def _height_to_pressure_hpa(height_m: float) -> float:
    # Convert geometric height to pressure with the same empirical formula
    # used in the reference workflow.
    return 1013.25 * (1 - 0.0065 * height_m / 288.15) ** 5.25588


def _calc_es(temp_c: float) -> float:
    # Saturation vapor pressure over liquid water.
    a1 = 1.809567918
    a2 = 7.266296315e-2
    a3 = -2.99640337e-4
    a4 = 1.160464233e-6
    a5 = -4.60651397e-9
    a6 = 2.315159066e-11
    a7 = -1.103513358e-13
    exponent = (
        a1
        + a2 * temp_c
        + a3 * temp_c ** 2
        + a4 * temp_c ** 3
        + a5 * temp_c ** 4
        + a6 * temp_c ** 5
        + a7 * temp_c ** 6
    )
    return math.exp(exponent)


def _calc_ei(temp_c: float, es: float) -> float:
    # Saturation vapor pressure over ice. In the reference script ei is only
    # computed for sub-zero temperatures; for temp >= 0 C it stays 0.
    # That detail is important because the later class conditions explicitly
    # rely on es > ei being true in above-freezing layers.
    if temp_c >= 0:
        return 0.0

    numerator = math.exp(21.8745584 * temp_c / (temp_c + 273.16 - 7.66))
    denominator = math.exp(17.2693882 * temp_c / (temp_c + 273.16 - 35.86))
    return es * (numerator / denominator)


def _calc_e(temp_c: float, rh: float, pressure_hpa: float, es: float) -> Optional[float]:
    # Convert RH and saturation vapor pressure into actual vapor pressure.
    if pressure_hpa <= 0:
        return None
    return 0.622 * rh / 100.0 * es / (0.611 + 0.622 * rh / 100.0 * es / pressure_hpa)


def _interpolate_crossing_height(levels_m: List[int], values: List[Optional[float]], target: float) -> Optional[float]:
    # Estimate the height where the profile crosses a target temperature
    # such as 0 C or -5 C using simple linear interpolation.
    valid_points = [
        (float(level_m), float(value))
        for level_m, value in zip(levels_m, values)
        if value is not None
    ]
    if len(valid_points) < 2:
        return None

    for idx in range(len(valid_points) - 1):
        h1, v1 = valid_points[idx]
        h2, v2 = valid_points[idx + 1]
        if v1 == target:
            return h1
        if v2 == target:
            return h2
        if (v1 - target) * (v2 - target) < 0:
            ratio = (target - v1) / (v2 - v1)
            return h1 + ratio * (h2 - h1)
    return None


def _build_zone_ranges(levels_m: List[int], zone_codes: List[int]) -> List[Dict[str, object]]:
    # Merge consecutive layers with the same non-zero classification into
    # larger saturated-zone segments for easier downstream display/use.
    ranges: List[Dict[str, object]] = []
    start_index = None
    current_code = None

    for idx, code in enumerate(zone_codes):
        if code in (1, 2, 3):
            if start_index is None:
                start_index = idx
                current_code = code
                continue
            if code == current_code:
                continue
            ranges.append({
                'zone_code': current_code,
                'zone_label': ZONE_LABELS[current_code],
                'bottom_m': levels_m[start_index],
                'top_m': levels_m[idx - 1],
            })
            start_index = idx
            current_code = code
            continue

        if start_index is not None and current_code is not None:
            ranges.append({
                'zone_code': current_code,
                'zone_label': ZONE_LABELS[current_code],
                'bottom_m': levels_m[start_index],
                'top_m': levels_m[idx - 1],
            })
            start_index = None
            current_code = None

    if start_index is not None and current_code is not None:
        ranges.append({
            'zone_code': current_code,
            'zone_label': ZONE_LABELS[current_code],
            'bottom_m': levels_m[start_index],
            'top_m': levels_m[len(zone_codes) - 1],
        })

    return ranges


def identify_saturated_zones(
    levels_m: List[int],
    temperature_profile: List[Optional[float]],
    humidity_profile: List[Optional[float]],
) -> Dict[str, object]:
    # Produce both per-level and merged-zone results so the frontend can
    # choose between detailed rendering and summary rendering.
    zone_codes: List[int] = []

    for level_m, temp_c, rh in zip(levels_m, temperature_profile, humidity_profile):
        if temp_c is None or rh is None:
            zone_codes.append(-1)
            continue

        es = _calc_es(temp_c)
        ei = _calc_ei(temp_c, es)
        pressure_hpa = _height_to_pressure_hpa(level_m)
        e = _calc_e(temp_c, rh, pressure_hpa, es)

        code = 0
        if e is not None and rh >= RH_THRESHOLD:
            # Three saturated-zone classes copied from the reference script:
            # 1: e > es > ei
            # 2: es > e > ei
            # 3: es > ei > e
            if es > ei and e > es:
                code = 1
            elif e < es and e > ei:
                code = 2
            elif es > ei and e < ei:
                code = 3

        zone_codes.append(code)

    return {
        'rh_threshold': RH_THRESHOLD,
        'zero_deg_height_m': _interpolate_crossing_height(levels_m, temperature_profile, 0.0),
        'minus5_deg_height_m': _interpolate_crossing_height(levels_m, temperature_profile, -5.0),
        'zone_codes': zone_codes,
        'zone_labels': [ZONE_LABELS[code] for code in zone_codes],
        'zone_ranges': _build_zone_ranges(levels_m, zone_codes),
    }
