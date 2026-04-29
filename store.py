from collections import OrderedDict
from datetime import datetime
from typing import Any, Dict


class InMemoryStore:
    def __init__(self, max_history_seconds: int = 3600):
        self.max_history_seconds = max_history_seconds

        self.track_store: 'OrderedDict[datetime, Any]' = OrderedDict()
        self.scdp_store: 'OrderedDict[datetime, Any]' = OrderedDict()
        self.icfp_store: 'OrderedDict[datetime, Any]' = OrderedDict()
        self.mwr_store: 'OrderedDict[datetime, Any]' = OrderedDict()
        self.aligned_store: 'OrderedDict[datetime, Any]' = OrderedDict()

        self.track_arrival_at: Dict[datetime, datetime] = {}
        self.mwr_arrival_at: Dict[datetime, datetime] = {}
        self.mwr_pending: Dict[datetime, Dict[str, Any]] = {}

        self.file_states = {
            'track': {
                'offset': 0,
                'partial': '',
                'header_done': False,
                'path_exists': True,
            },
            'scdp': {
                'offset': 0,
                'partial': '',
                'header_done': False,
                'column_map': None,
                'path_exists': True,
            },
            'icfp': {
                'offset': 0,
                'partial': '',
                'header_done': False,
                'column_map': None,
                'path_exists': True,
            },
            'mwr': {
                'offset': 0,
                'partial': '',
                'header_done': False,
                'column_map': None,
                'path_exists': True,
            },
        }

    def _trim(self, data: OrderedDict):
        while len(data) > self.max_history_seconds:
            data.popitem(last=False)

    def _trim_mwr(self, data: OrderedDict):
        while len(data) > self.max_history_seconds:
            oldest_key, _ = data.popitem(last=False)
            self.mwr_arrival_at.pop(oldest_key, None)

    def _trim_track(self, data: OrderedDict):
        while len(data) > self.max_history_seconds:
            oldest_key, _ = data.popitem(last=False)
            self.track_arrival_at.pop(oldest_key, None)

    def put_track(self, record, arrival_at: datetime):
        self.track_store[record.time] = record
        self.track_arrival_at[record.time] = arrival_at
        self._trim_track(self.track_store)

    def put_scdp(self, record):
        self.scdp_store[record.time] = record
        self._trim(self.scdp_store)

    def put_icfp(self, record):
        self.icfp_store[record.time] = record
        self._trim(self.icfp_store)

    def put_mwr(self, record, arrival_at: datetime = None):
        self.mwr_store[record.time] = record
        if arrival_at is not None:
            self.mwr_arrival_at[record.time] = arrival_at
        self._trim_mwr(self.mwr_store)

    def put_aligned(self, frame):
        self.aligned_store[frame.time] = frame
        self._trim(self.aligned_store)

    def latest_aligned(self):
        if not self.aligned_store:
            return None
        return next(reversed(self.aligned_store.values()))
