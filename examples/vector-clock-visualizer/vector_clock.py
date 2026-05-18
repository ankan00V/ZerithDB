import copy
from collections import defaultdict

class VectorClock:
    def __init__(self, peer_id: str):
        self.peer_id = peer_id
        self.clock = defaultdict(int)

    def increment(self) -> dict:
        self.clock[self.peer_id] += 1
        return self.get_clock()

    def merge(self, other_clock: dict) -> dict:
        for pid, count in other_clock.items():
            self.clock[pid] = max(self.clock.get(pid, 0), count)
        return self.get_clock()

    def get_clock(self) -> dict:
        return dict(self.clock)

    def is_concurrent(self, other_clock: dict) -> bool:
        self_greater = False
        other_greater = False
        all_keys = set(self.clock.keys()).union(set(other_clock.keys()))
        
        for k in all_keys:
            v1 = self.clock.get(k, 0)
            v2 = other_clock.get(k, 0)
            if v1 > v2:
                self_greater = True
            elif v2 > v1:
                other_greater = True
                
        return self_greater and other_greater