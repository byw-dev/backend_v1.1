import asyncio
from datetime import datetime

from aligner import align_one_time
from config import MWR_HOLD_SEC
from readers import poll_all_sources
from store import InMemoryStore


async def main():
    store = InMemoryStore(max_history_seconds=3600)
    await poll_all_sources(store)

    # Use 0 delay in smoke test to align immediately after initial load.
    for t in sorted(store.track_store.keys()):
        frame = align_one_time(t, store, mwr_hold_sec=MWR_HOLD_SEC)
        if frame:
            store.put_aligned(frame)

    latest = store.latest_aligned()
    print('track_count=', len(store.track_store))
    print('scdp_count=', len(store.scdp_store))
    print('icfp_count=', len(store.icfp_store))
    print('mwr_count=', len(store.mwr_store))
    print('aligned_count=', len(store.aligned_store))
    if latest:
        print('latest_time=', latest.time.isoformat())
        print('latest_track=', latest.track.data)
        print('latest_scdp=', latest.scdp.status, latest.scdp.data)
        print('latest_icfp=', latest.icfp.status, latest.icfp.data)
        print('latest_mwr=', latest.mwr.status, latest.mwr.source_time, latest.mwr.age_sec)


if __name__ == '__main__':
    asyncio.run(main())
