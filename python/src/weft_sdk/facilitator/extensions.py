"""Per-request route extensions resolved while the 402 challenge is built."""

from __future__ import annotations

import json
import math
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from .warn import Warn, create_warn

WEFT_REQUEST_EXTENSION_KEY = "weft.request"
MAX_EXTENSION_BYTES = 16 * 1024
WEFT_REQUEST_INFO_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Weft per-request context",
    "description": (
        "Seller-authored context for one paid request, for display only. "
        "Unauthenticated buyer input by the time it is read; key nothing on it."
    ),
    "type": "object",
    "additionalProperties": True,
}

WeftDynamicExtension = Callable[[Any], Any | Awaitable[Any]]


class _JsonNormalizer:
    """Match JSON.stringify: NaN becomes null, cycles and bare functions fail."""

    def __init__(self) -> None:
        self._seen: set[int] = set()

    def convert(self, value: object) -> object:
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        if isinstance(value, dict):
            return self._container(value, value.items())
        if isinstance(value, (list, tuple)):
            return self._container(value, enumerate(value), as_list=True)
        if callable(value):
            raise ValueError("JSON cannot carry a function")
        return value

    def _container(
        self,
        value: object,
        items: Any,
        *,
        as_list: bool = False,
    ) -> object:
        identity = id(value)
        if identity in self._seen:
            raise ValueError("circular")
        self._seen.add(identity)
        try:
            if as_list:
                return [None if callable(item) else self.convert(item) for _index, item in items]
            return {key: self.convert(item) for key, item in items if not callable(item)}
        finally:
            self._seen.discard(identity)


def to_json(value: object) -> str | None:
    """Serialize a value, or return None when JSON cannot carry it."""

    try:
        return json.dumps(
            _JsonNormalizer().convert(value),
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError):
        return None


def _request_of(context: Any) -> Any:
    transport = getattr(context, "transport_context", None)
    if transport is None and isinstance(context, Mapping):
        transport = context.get("transportContext", context.get("transport_context"))
    if transport is None:
        return None
    if isinstance(transport, Mapping):
        return transport.get("request")
    return getattr(transport, "request", None)


def _extensions_of(context: Any) -> dict[str, Any] | None:
    response = getattr(context, "payment_required_response", None)
    if response is None and isinstance(context, Mapping):
        response = context.get("paymentRequiredResponse", context.get("payment_required_response"))
    if response is None:
        return None
    if isinstance(response, Mapping):
        extensions = response.get("extensions")
    else:
        extensions = getattr(response, "extensions", None)
    return extensions if isinstance(extensions, dict) else None


def _drop_key(context: Any, key: str) -> None:
    extensions = _extensions_of(context)
    if extensions is not None:
        extensions.pop(key, None)


class DynamicExtension:
    """Resource-server extension that resolves one callback key."""

    def __init__(self, key: str, warn: Warn) -> None:
        self.key = key
        self._warn = warn

    def enrich_declaration(self, declaration: Any, transport_context: Any) -> Any:
        """Leave the callback in place. Resolution happens on the 402 hook."""

        del transport_context
        return declaration

    async def enrich_payment_required_response(self, declaration: Any, context: Any) -> Any:
        if not callable(declaration):
            return None
        request = _request_of(context)
        if request is None:
            self._warn(
                f"extensions[{self.key}] is a callback but no HTTP request context "
                "reached it; dropping the key from the challenge",
                f"{self.key}:no-request",
            )
            _drop_key(context, self.key)
            return None
        try:
            resolved = declaration(request)
            if isinstance(resolved, Awaitable):
                resolved = await resolved
        except Exception as error:  # noqa: BLE001 - a callback must not fail the payment
            self._warn(
                f"extensions[{self.key}] callback failed; dropping the key from the "
                f"challenge: {error}",
                f"{self.key}:threw",
            )
            _drop_key(context, self.key)
            return None
        if resolved is None:
            _drop_key(context, self.key)
            return None
        encoded = to_json(resolved)
        if encoded is None:
            self._warn(
                f"extensions[{self.key}] callback returned a value JSON cannot carry (a "
                "function, a circular reference, a BigInt or similar); dropping the key "
                "from the challenge",
                f"{self.key}:unserializable",
            )
            _drop_key(context, self.key)
            return None
        wire = json.loads(encoded)
        if not isinstance(wire, dict):
            kind = "an array" if isinstance(wire, list) else f"a {type(wire).__name__}"
            self._warn(
                f"extensions[{self.key}] callback returned {kind}; the x402 extensions "
                "channel carries objects, so the key is dropped from the challenge",
                f"{self.key}:not-an-object",
            )
            _drop_key(context, self.key)
            return None
        value: Any = (
            {"info": wire, "schema": WEFT_REQUEST_INFO_SCHEMA}
            if self.key == WEFT_REQUEST_EXTENSION_KEY
            else wire
        )
        projected = _projected_bytes(context, self.key, value)
        size = projected if projected is not None else len(encoded.encode("utf-8"))
        if size > MAX_EXTENSION_BYTES:
            self._warn(
                f"extensions[{self.key}] takes the challenge's extensions to {size} "
                f"bytes, over the {MAX_EXTENSION_BYTES}-byte facilitator relay cap; "
                "dropping the key so the rest of the declaration still reaches settlement",
                f"{self.key}:over-cap",
            )
            _drop_key(context, self.key)
            return None
        return value

    def enrich_settlement_response(self, declaration: Any, context: Any) -> None:
        del declaration, context
        return None

    @property
    def hooks(self) -> None:
        return None

    @property
    def transport_hooks(self) -> None:
        return None

    @property
    def dynamic_info_fields(self) -> None:
        return None


def dynamic_extension(key: str, warn: Warn) -> DynamicExtension:
    """Build the resource-server extension that resolves one dynamic key."""

    return DynamicExtension(key, warn)


def _projected_bytes(context: Any, key: str, value: object) -> int | None:
    extensions = _extensions_of(context) or {}
    projected = {**extensions, key: value}
    encoded = to_json(projected)
    if encoded is None:
        return None
    return len(encoded.encode("utf-8"))


def _route_configs(routes: object) -> list[Any]:
    if not isinstance(routes, dict):
        return []
    configs = [routes] if "accepts" in routes else list(routes.values())
    return [config for config in configs if isinstance(config, dict)]


def dynamic_extension_keys(routes: object) -> list[str]:
    """Return extension keys declared as a callback by at least one route."""

    keys: list[str] = []
    seen: set[str] = set()
    for config in _route_configs(routes):
        extensions = config.get("extensions")
        if not isinstance(extensions, dict):
            continue
        for key, value in extensions.items():
            if callable(value) and key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def register_dynamic_extensions(server: Any, routes: object) -> None:
    """Teach a resource server to resolve per-request extension callbacks."""

    keys = dynamic_extension_keys(routes)
    if not keys:
        return
    warn = create_warn()
    register = getattr(server, "register_extension", None)
    if not callable(register):
        warn(
            "this x402 build has no register_extension, so per-request route "
            f"extensions ({', '.join(keys)}) cannot be resolved and will not ship",
            "register-extension-missing",
        )
        return
    for key in keys:
        register(dynamic_extension(key, warn))
