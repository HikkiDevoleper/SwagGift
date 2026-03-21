import asyncio
from dataclasses import dataclass, asdict
from typing import Dict


@dataclass
class RuntimeFlags:
    demo: bool = False
    gifts: bool = False
    maint: bool = False
    testpay: bool = False


class RuntimeState:
    def __init__(self) -> None:
        self._flags = RuntimeFlags()
        self._lock = asyncio.Lock()

    async def snapshot(self) -> Dict[str, bool]:
        async with self._lock:
            return asdict(self._flags)

    async def get(self, key: str) -> bool:
        async with self._lock:
            return bool(getattr(self._flags, key))

    async def set(self, key: str, value: bool) -> bool:
        async with self._lock:
            setattr(self._flags, key, bool(value))
            return bool(getattr(self._flags, key))

    async def toggle(self, key: str) -> bool:
        async with self._lock:
            next_value = not bool(getattr(self._flags, key))
            setattr(self._flags, key, next_value)
            return next_value


runtime_state = RuntimeState()
