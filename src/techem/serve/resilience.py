"""Resilience layer for external API calls.

Pattern: decorate a function that fetches live data. We cache results on
disk keyed by args, and fall back to a bundled static JSON if both the
live call and the cache miss.

    @resilient(fallback=DATA_EXTERNAL / "mock_weather.json")
    def fetch_weather(zipcode: str, start, end): ...
"""
from __future__ import annotations

import functools
import hashlib
import json
import logging
import pickle
from pathlib import Path
from typing import Callable

import diskcache

from techem.config import DATA_CACHE

log = logging.getLogger(__name__)

_CACHE = diskcache.Cache(str(DATA_CACHE / "http"))


def _key(func: Callable, args: tuple, kwargs: dict) -> str:
    payload = pickle.dumps((func.__module__, func.__qualname__, args, sorted(kwargs.items())))
    return hashlib.sha256(payload).hexdigest()


def resilient(
    fallback: Path | str | None = None,
    ttl_seconds: int = 60 * 60 * 24 * 7,
):
    """Cache successful results, fall back to static JSON on failure.

    The fallback is returned as a Python object (json-decoded). The caller
    is responsible for reshaping it into whatever it expects (pandas df
    construction, dict lookup, etc.).
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            k = _key(func, args, kwargs)
            cached = _CACHE.get(k)
            if cached is not None:
                return cached
            try:
                result = func(*args, **kwargs)
                _CACHE.set(k, result, expire=ttl_seconds)
                return result
            except Exception as e:  # pragma: no cover - network dependent
                log.warning("resilient(%s): live fetch failed (%s); trying fallback", func.__qualname__, e)
                if fallback is None:
                    raise
                path = Path(fallback)
                if not path.exists():
                    raise FileNotFoundError(f"No fallback at {path}") from e
                with path.open("r", encoding="utf-8") as fh:
                    return json.load(fh)
        return wrapper
    return decorator


def clear_cache() -> None:
    _CACHE.clear()
