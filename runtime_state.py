import asyncio
from dataclasses import dataclass, asdict, field
from typing import Any, Dict


@dataclass
class RuntimeFlags:
    demo: bool = False
    gifts: bool = False
    maint: bool = False
    testpay: bool = False


class RuntimeState:
    def __init__(self) -> None:
        self._flags = RuntimeFlags()
        self._spin_cost: int = 15  # default, overridden from config
        self._lock = asyncio.Lock()

    def set_default_cost(self, cost: int) -> None:
        """Called once at startup to set initial spin cost from env."""
        self._spin_cost = cost

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

    async def get_spin_cost(self) -> int:
        async with self._lock:
            return self._spin_cost

    async def set_spin_cost(self, cost: int) -> int:
        async with self._lock:
            self._spin_cost = max(0, int(cost))
            return self._spin_cost


runtime_state = RuntimeState()
