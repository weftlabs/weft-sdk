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
    ttl: float


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


def _supported_headers(config: Optional[WeftFacilitatorConfig]) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if not config:
        return headers
    seller = config.get("create_auth_headers", config.get("create_headers"))
    if not callable(seller):
        return headers
    raw = seller()
    if not isinstance(raw, dict):
        return headers
    supported = raw.get("supported")
    if isinstance(supported, dict):
        headers.update({str(key): str(value) for key, value in supported.items()})
    return headers


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
            headers=_supported_headers(config),
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

    ttl = cache_config.get("ttl", DEFAULT_CACHE_TTL) if cache_config else DEFAULT_CACHE_TTL
    _fee_cache = {
        "fee_info": fee_info,
        "fetched_at": time.time(),
        "ttl": ttl,
    }

    return fee_info
