"""
Small Himawari tile probe.

JMA Himawari tiles are addressed as:
  {base_time}/fd/{valid_time}/{band}/{product}/{z}/{x}/{y}.{format}
  {base_time}/jp/{valid_time}/{band}/{product}/{z}/{x}/{y}.{format}

Common products used by the dashboard:
  B13/TBB   infrared brightness temperature
  B03/ALBD  visible reflectance

The script prefers png when JMA serves it for the sampled tile, and falls back
to jpg. It writes one tile near lon=120, lat=40 for quick manual inspection.
"""

import math
from pathlib import Path

import requests


TARGET_TIMES_URLS = {
    "fd": "https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json",
    "jp": "https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_jp.json",
}
TILE_URL_TEMPLATES = {
    "fd": (
        "https://www.jma.go.jp/bosai/himawari/data/satimg/"
        "{base_time}/fd/{valid_time}/{band}/{product}/{z}/{x}/{y}.{image_format}"
    ),
    "jp": (
        "https://www.jma.go.jp/bosai/himawari/data/satimg/"
        "{base_time}/jp/{valid_time}/{band}/{product}/{z}/{x}/{y}.{image_format}"
    ),
}
PREFERRED_FORMATS = ("png", "jpg")
PRODUCTS = {
    "infrared": ("B13", "TBB"),
    "visible": ("B03", "ALBD"),
}


def lonlat_to_xyz(lon, lat, z):
    lat_rad = math.radians(lat)
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def latest_himawari_time(source):
    times = requests.get(TARGET_TIMES_URLS[source], timeout=20).json()
    latest = max(times, key=lambda item: item["validtime"])
    return latest["basetime"], latest["validtime"]


def build_tile_url(source, base_time, valid_time, band, product, z, x, y, image_format):
    return TILE_URL_TEMPLATES[source].format(
        base_time=base_time,
        valid_time=valid_time,
        band=band,
        product=product,
        z=z,
        x=x,
        y=y,
        image_format=image_format,
    )


def fetch_first_available_tile(source, base_time, valid_time, band, product, z, x, y):
    errors = []
    for image_format in PREFERRED_FORMATS:
        url = build_tile_url(source, base_time, valid_time, band, product, z, x, y, image_format)
        response = requests.get(url, timeout=30)
        if response.ok and response.headers.get("content-type", "").startswith("image/"):
            return image_format, url, response.content
        errors.append(f"{image_format}: status={response.status_code}")
    raise RuntimeError("; ".join(errors))


def main():
    source = "jp"
    base_time, valid_time = latest_himawari_time(source)
    z = 6
    x, y = lonlat_to_xyz(120, 40, z)
    band, product = PRODUCTS["infrared"]
    image_format, url, content = fetch_first_available_tile(source, base_time, valid_time, band, product, z, x, y)
    output = Path(f"himawari_tile_{source}_z{z}.{image_format}")
    output.write_bytes(content)
    print(url)
    print(f"saved {output}")


if __name__ == "__main__":
    main()
