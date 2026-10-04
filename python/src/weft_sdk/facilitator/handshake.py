"""Construction-time facilitator auth headers."""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Mapping
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from .product import resolve_dimensions, sanitize_product_identity
from .warn import console_warn, create_warn

WEFT_DECLARED_HEADER = "X-Weft-Declared"
WEFT_API_KEY_HEADER = "X-API-Key"
ADAPTER_NAME = "asgi"
HEADER_SAFE = re.compile(r"^[\x21-\x7e]+$")
DECLARED_KEYS = ("name", "type", "tags", "icon_url", "dimensions")


def sdk_version() -> str:
    """Return the installed SDK version used in the facilitator User-Agent."""

    try:
        return version("weft-sdk")
    except PackageNotFoundError:
        return "0.29.0"


def _base64url(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def declared_identity_value(declaration: Mapping[str, Any]) -> str | None:
    """Build the X-Weft-Declared value, or None when nothing survives."""

    declared = sanitize_product_identity(declaration)
    dimensions = resolve_dimensions(
        declaration.get("dimensions"),
        create_warn(),
    )
    payload: dict[str, Any] = {}
    if "name" in declared:
        payload["name"] = declared["name"]
    if "type" in declared:
        payload["type"] = declared["type"]
    if "tags" in declared:
        payload["tags"] = declared["tags"]
    icon_url = declared.get("iconUrl")
    if icon_url is not None:
        payload["icon_url"] = icon_url
    if dimensions is not None:
        payload["dimensions"] = dimensions
    if not payload:
        return None
    ordered = {key: payload[key] for key in DECLARED_KEYS if key in payload}
    return _base64url(json.dumps(ordered, separators=(",", ":"), ensure_ascii=False))


def resolve_api_key(api_key: object) -> str | None:
    """Read a declared API key. The value is never logged."""

    if api_key is None:
        return None
    if not isinstance(api_key, str):
        console_warn(f"[weft] ignoring apiKey: expected a string, got {type(api_key).__name__}")
        return None
    trimmed = api_key.strip()
    if trimmed == "":
        console_warn("[weft] ignoring empty apiKey")
        return None
    if HEADER_SAFE.fullmatch(trimmed) is None:
        console_warn(
            "[weft] ignoring apiKey: it contains whitespace or non-printable "
            "characters that cannot travel in an HTTP header"
        )
        return None
    return trimmed


def build_facilitator_auth_headers(
    adapter: str,
    api_key: object,
    declaration: Mapping[str, Any] | None,
) -> dict[str, dict[str, str]]:
    """Build path-keyed auth headers. Unusable input is dropped, never raised."""

    key = resolve_api_key(api_key)
    supported: dict[str, str] = {"User-Agent": f"weft-sdk-{adapter}/{sdk_version()}"}
    if key is not None:
        supported["Authorization"] = f"Bearer {key}"
    declared = declared_identity_value(declaration or {})
    if declared is not None:
        supported[WEFT_DECLARED_HEADER] = declared
    headers: dict[str, dict[str, str]] = {"supported": supported}
    if key is not None:
        credential = {WEFT_API_KEY_HEADER: key}
        headers["settle"] = credential
        headers["verify"] = dict(credential)
    return headers
