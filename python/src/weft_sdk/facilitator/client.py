"""Weft facilitator client.

Wire types and HTTP encoding come from the upstream ``x402`` package. This
module adds Weft URL resolution, path-keyed auth headers, and the settlement
unavailable classification.
"""

from __future__ import annotations

import inspect
import json
import os
from collections.abc import Callable, Mapping
from typing import Any, cast

import httpx
from x402.http import HTTPFacilitatorClient
from x402.schemas import PaymentPayload, PaymentRequirements, SettleResponse
from x402.schemas.errors import SettleError
from x402.schemas.v1 import PaymentPayloadV1, PaymentRequirementsV1

from .settlement import FACILITATOR_UNAVAILABLE_ERROR, SETTLEMENT_HTTP_METHOD

X402_FACILITATOR_URL = "https://x402.weft.network"
X402_FACILITATOR_URL_ENV = "X402_FACILITATOR_URL"
PATH_KEYS = ("verify", "settle", "supported", "bazaar")

CreateAuthHeaders = Callable[[], Mapping[str, Mapping[str, str]]]
WeftFacilitatorConfig = dict[str, Any]


class FacilitatorUnavailableError(Exception):
    """Raised when settle cannot credit the seller because the facilitator is down."""

    def __init__(self) -> None:
        super().__init__(FACILITATOR_UNAVAILABLE_ERROR)


def validate_url(url: str) -> None:
    """Reject an empty URL or a URL without an http(s) scheme."""

    if not url or url.strip() == "":
        raise ValueError("Invalid URL: URL cannot be empty")
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError(f"Invalid URL format: URL must start with http:// or https://, got: {url}")


def resolve_url(config: WeftFacilitatorConfig | None = None) -> str:
    """Resolve the facilitator URL: config, then env, then the Weft default."""

    if config and config.get("url"):
        url = config["url"]
        return url if isinstance(url, str) else str(url)
    env_url = os.environ.get(X402_FACILITATOR_URL_ENV)
    if env_url:
        return env_url
    return X402_FACILITATOR_URL


def _is_header_object(value: object) -> bool:
    return isinstance(value, dict)


def assert_path_keyed_auth_headers(headers: Mapping[str, Any]) -> None:
    """Reject a flat headers object the way ``@x402/core`` itself would."""

    has_path_key = any(_is_header_object(headers.get(key)) for key in PATH_KEYS)
    looks_flat = not has_path_key and any(
        not _is_header_object(value) for value in headers.values()
    )
    if looks_flat:
        raise ValueError(
            "createAuthHeaders must return an object keyed by facilitator path, "
            'e.g. { verify: { Authorization: "..." }, settle: { ... }, '
            "supported: { ... } }, but received a flat headers object."
        )


def merge_seller_wins(
    derived: Mapping[str, str],
    seller: Mapping[str, str] | None,
) -> dict[str, str]:
    """Merge headers. A seller header replaces any derived header of the same name."""

    merged = dict(derived)
    for name, value in (seller or {}).items():
        for existing in list(merged):
            if existing.lower() == name.lower():
                del merged[existing]
        merged[name] = value
    return merged


def _seller_create_headers(config: WeftFacilitatorConfig | None) -> CreateAuthHeaders | None:
    if not config:
        return None
    seller = config.get("create_auth_headers", config.get("create_headers"))
    if seller is None:
        return None
    if not callable(seller):
        raise TypeError("create_auth_headers must be a callable")
    if _is_async_callable(seller):
        raise TypeError(
            "create_auth_headers must be synchronous; "
            "x402 2.18.0 resolves facilitator auth headers synchronously"
        )
    return cast(CreateAuthHeaders, seller)


def _is_async_callable(seller: Callable[..., Any]) -> bool:
    if inspect.iscoroutinefunction(seller):
        return True
    call = getattr(type(seller), "__call__", None)
    return inspect.iscoroutinefunction(call)


def _merged_create_headers(
    seller: CreateAuthHeaders | None,
    weft_auth_headers: Mapping[str, Mapping[str, str]] | None,
) -> CreateAuthHeaders | None:
    derived = {
        path: dict(headers) for path, headers in (weft_auth_headers or {}).items() if headers
    }
    if not derived and seller is None:
        return None

    def create_headers() -> dict[str, dict[str, str]]:
        raw = seller() if seller is not None else None
        if inspect.iscoroutine(raw):
            raw.close()
            raise TypeError(
                "create_auth_headers must be synchronous; "
                "x402 2.18 resolves facilitator auth headers synchronously"
            )
        if raw is not None and not isinstance(raw, Mapping):
            raise TypeError("createAuthHeaders must return an object")
        seller_headers = dict(raw) if raw else None
        if seller_headers:
            assert_path_keyed_auth_headers(seller_headers)
        merged: dict[str, dict[str, str]] = {
            path: dict(value)
            for path, value in (seller_headers or {}).items()
            if isinstance(value, Mapping)
        }
        for path, headers in derived.items():
            current = seller_headers.get(path) if seller_headers else None
            seller_path = dict(current) if isinstance(current, Mapping) else None
            merged[path] = merge_seller_wins(headers, seller_path)
        return merged

    return create_headers


def _settle_failure(error: ValueError) -> Exception | None:
    """Reclassify a 503 settle the way the TypeScript client does."""

    message = str(error)
    prefix = "Facilitator settle failed ("
    if not message.startswith(prefix):
        return None
    status_text, _, body = message[len(prefix) :].partition(")")
    if status_text != "503" or not body.startswith(":"):
        return None
    payload = body[1:].strip()
    parsed: object
    try:
        parsed = json.loads(payload) if payload else None
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or "success" not in parsed:
        return None
    reason = parsed.get("errorReason", parsed.get("error_reason"))
    transaction = parsed.get("transaction")
    if reason == "settlement_pending" and transaction:
        return SettleError(
            "settlement_pending",
            parsed.get("errorMessage", parsed.get("error_message")),
            str(transaction),
            parsed.get("payer"),
        )
    return FacilitatorUnavailableError()


class FacilitatorClient(HTTPFacilitatorClient):
    """x402 facilitator client with Weft settlement classification."""

    def __init__(self, config: WeftFacilitatorConfig | str | None = None) -> None:
        if isinstance(config, str):
            config = {"url": config}
        super().__init__(config)

    async def settle(
        self,
        payload: PaymentPayload | PaymentPayloadV1,
        requirements: PaymentRequirements | PaymentRequirementsV1,
    ) -> SettleResponse:
        payload_dict = payload.model_dump(by_alias=True, exclude_none=True)
        method = SETTLEMENT_HTTP_METHOD.get()
        if method:
            payload_dict["httpMethod"] = method
        requirements_dict = requirements.model_dump(by_alias=True, exclude_none=True)
        try:
            return await self._settle_http(
                payload.x402_version,
                payload_dict,
                requirements_dict,
            )
        except ValueError as error:
            classified = _settle_failure(error)
            if classified is not None:
                raise classified from error
            raise
        except httpx.TransportError as error:
            raise FacilitatorUnavailableError() from error


def create_facilitator_client(
    config: WeftFacilitatorConfig | None = None,
    weft_auth_headers: Mapping[str, Mapping[str, str]] | None = None,
) -> FacilitatorClient:
    """Create a facilitator client. The API key is not logged."""

    url = resolve_url(config)
    validate_url(url)
    create_headers = _merged_create_headers(_seller_create_headers(config), weft_auth_headers)
    client_config: dict[str, Any] = {"url": url}
    if create_headers is not None:
        client_config["create_headers"] = create_headers
    return FacilitatorClient(client_config)
