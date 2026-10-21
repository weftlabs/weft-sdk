"""
Fee information helpers for Weft Facilitator.
"""

import time
from typing import Optional

import httpx
from typing_extensions import TypedDict

from .client import WeftFacilitatorConfig, resolve_url, validate_url


class FeeInfo(TypedDict):
    amount: str
    asset: str
    network: str


class FeeCacheConfig(TypedDict, total=False):
    """Cache settings for fee lookup.

    ``ttl`` and ``ttl_seconds`` are seconds. TypeScript ``ttl`` is milliseconds.
    The default is 300 seconds.
    """

    ttl: float
    ttl_seconds: float


class _FeeCache(TypedDict):
    fee_info: FeeInfo
    fetched_at: float
    ttl: float


DEFAULT_CACHE_TTL = 300.0

_fee_cache: Optional[_FeeCache] = None


def invalidate_fee_cache() -> None:
    global _fee_cache
    _fee_cache = None


def _is_cache_valid() -> bool:
    if _fee_cache is None:
        return False
    now = time.time()
    return now - _fee_cache["fetched_at"] < _fee_cache["ttl"]


async def get_fee_info(
    config: Optional[WeftFacilitatorConfig] = None,
    cache_config: Optional[FeeCacheConfig] = None,
) -> FeeInfo:
    global _fee_cache

    if _is_cache_valid() and _fee_cache is not None:
        return _fee_cache["fee_info"]

    url = resolve_url(config)
    validate_url(url)

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{url}/supported",
            # Fee data is public. Seller credentials stay off this call: a valid
            # key on /supported is an identity handshake, not a fee lookup.
            headers={"Content-Type": "application/json"},
            follow_redirects=True,
        )

        if response.status_code != 200:
            raise ValueError(f"Failed to fetch fee info: {response.status_code} {response.text}")

        data = response.json()

    fee = data.get("fee")
    if fee is None:
        raise ValueError("Fee information not found in /supported response")

    if not isinstance(fee.get("amount"), str):
        raise ValueError("Invalid fee structure: amount must be a string")
    if not isinstance(fee.get("asset"), str):
        raise ValueError("Invalid fee structure: asset must be a string")
    if not isinstance(fee.get("network"), str):
        raise ValueError("Invalid fee structure: network must be a string")

    fee_info: FeeInfo = {
        "amount": fee["amount"],
        "asset": fee["asset"],
        "network": fee["network"],
    }

    ttl = DEFAULT_CACHE_TTL
    if cache_config:
        configured = cache_config.get("ttl_seconds", cache_config.get("ttl"))
        if configured is not None:
            ttl = configured
    _fee_cache = {
        "fee_info": fee_info,
        "fetched_at": time.time(),
        "ttl": ttl,
    }

    return fee_info
