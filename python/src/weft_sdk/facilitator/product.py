"""Product identity applied to every protected route."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

from .warn import Warn, create_warn, show, type_name

WEFT_PRODUCT_EXTENSION_KEY = "weft.product"
WEFT_TYPE_TAG_PREFIX = "weft:type:"
PRODUCT_TYPES: tuple[str, ...] = ("api", "agent", "mcp")
MAX_TAGS = 5
MAX_TAG_CHARS = 32
MAX_DIMENSIONS = 8
MAX_DIMENSION_CHARS = 64
MAX_SERVICE_NAME_CHARS = 32
MAX_ICON_URL_CHARS = 2048
PRINTABLE_ASCII = re.compile(r"^[\x20-\x7e]+$")
DIMENSION_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]*$")

WEFT_PRODUCT_INFO_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": list(PRODUCT_TYPES)},
        "product_id": {"type": "string", "minLength": 1},
        "manifest_hash": {"type": "string", "minLength": 1},
    },
    "additionalProperties": False,
}


def product_type_tag(product_type: str) -> str:
    """Build the reserved tag for a product type."""

    return f"{WEFT_TYPE_TAG_PREFIX}{product_type}"


def _declared(value: object) -> bool:
    return value is not None


def _is_single_route(routes: Mapping[str, Any]) -> bool:
    return "accepts" in routes


def _as_string(field: str, value: object, warn: Warn) -> str | None:
    if not _declared(value):
        return None
    if not isinstance(value, str):
        warn(
            f"ignoring {field} {show(value)}: expected a string, got {type_name(value)}",
            None,
        )
        return None
    return value


def _is_reserved_type_tag(tag: str) -> bool:
    return tag.strip().lower().startswith(WEFT_TYPE_TAG_PREFIX)


def resolve_type(value: object, field: str, warn: Warn) -> str | None:
    """Read a declared product type, rejecting anything outside the legal set."""

    if not _declared(value):
        return None
    if not isinstance(value, str) or value not in PRODUCT_TYPES:
        warn(
            f"ignoring {field} {show(value)}: expected one of {', '.join(PRODUCT_TYPES)}",
            None,
        )
        return None
    return value


def _as_tag_list(value: object, field: str, warn: Warn) -> list[str] | None:
    if not _declared(value):
        return None
    if not isinstance(value, list):
        warn(
            f"ignoring {field} {show(value)}: expected an array of strings, got {type_name(value)}",
            None,
        )
        return None
    tags: list[str] = []
    for entry in value:
        if isinstance(entry, str):
            tags.append(entry)
            continue
        warn(
            f"dropping tag {show(entry)}: expected a string, got {type_name(entry)}",
            None,
        )
    return tags


def resolve_tags(
    route_tags: object,
    identity_tags: object,
    product_type: str | None,
    warn: Warn,
) -> list[str] | None:
    """Resolve the tags for one route. The type tag is placed first."""

    declared = _as_tag_list(route_tags, "route tags", warn)
    if declared is None:
        declared = _as_tag_list(identity_tags, "tags", warn)
    if declared is None and product_type is None:
        return None

    seller_tags: list[str] = []
    for tag in declared or []:
        if not _is_reserved_type_tag(tag):
            seller_tags.append(tag)
            continue
        warn(
            f"dropping reserved tag {show(tag)}: declare the product kind with "
            f"`type` ({', '.join(PRODUCT_TYPES)}) on the middleware config or on the route",
            None,
        )

    malformed: list[str] = []
    carried: list[str] = []
    candidates = (
        [product_type_tag(product_type)] if product_type is not None else []
    ) + seller_tags
    for tag in candidates:
        if len(tag) <= MAX_TAG_CHARS and PRINTABLE_ASCII.fullmatch(tag):
            carried.append(tag)
        else:
            malformed.append(tag)
    if malformed:
        warn(
            f"dropping {len(malformed)} tag(s) the x402 protocol cannot carry "
            f"(max {MAX_TAG_CHARS} printable-ASCII characters each): {', '.join(malformed)}",
            None,
        )

    deduped = list(dict.fromkeys(carried))
    if len(deduped) > MAX_TAGS:
        dropped = deduped[MAX_TAGS:]
        type_note = " and the declared type uses one of them" if product_type is not None else ""
        warn(
            f"dropping {len(dropped)} tag(s): the x402 protocol carries {MAX_TAGS}{type_note}. "
            f"Dropped: {', '.join(dropped)}",
            None,
        )
    bounded = deduped[:MAX_TAGS]
    return bounded or None


def resolve_service_name(
    route_service_name: object,
    identity_name: object,
    warn: Warn,
) -> str | None:
    """Resolve the service name, truncating an over-long ASCII name."""

    declared = _as_string("route serviceName", route_service_name, warn)
    if declared is None:
        declared = _as_string("name", identity_name, warn)
    if declared is None:
        return None
    if PRINTABLE_ASCII.fullmatch(declared) is None:
        warn(
            f"dropping product name {show(declared)}: the x402 protocol carries "
            f"1-{MAX_SERVICE_NAME_CHARS} printable-ASCII characters (U+0020-U+007E)",
            None,
        )
        return None
    if len(declared) > MAX_SERVICE_NAME_CHARS:
        truncated = declared[:MAX_SERVICE_NAME_CHARS]
        warn(
            f"product name {show(declared)} is {len(declared)} characters; the x402 protocol "
            f"carries {MAX_SERVICE_NAME_CHARS}, so it travels as {show(truncated)}",
            None,
        )
        return truncated
    return declared


def resolve_icon_url(route_icon_url: object, identity_icon_url: object, warn: Warn) -> str | None:
    """Resolve an icon URL. Only absolute http and https URLs ship."""

    declared = _as_string("route iconUrl", route_icon_url, warn)
    if declared is None:
        declared = _as_string("iconUrl", identity_icon_url, warn)
    if declared is None:
        return None
    if len(declared) > MAX_ICON_URL_CHARS:
        warn(
            f"dropping iconUrl: {len(declared)} characters exceeds the "
            f"{MAX_ICON_URL_CHARS} the x402 protocol carries",
            None,
        )
        return None
    try:
        scheme = urlparse(declared).scheme
    except ValueError:
        scheme = ""
    if scheme not in {"http", "https"}:
        if "://" not in declared and not declared.lower().startswith("javascript:"):
            warn(
                f"dropping iconUrl {show(declared)}: expected an absolute http or https URL",
                None,
            )
        else:
            warn(
                f"dropping iconUrl {show(declared)}: only http and https are carried "
                "(a dashboard renders this URL)",
                None,
            )
        return None
    return declared


def resolve_dimensions(value: object, warn: Warn) -> list[str] | None:
    """Resolve analytics dimension names. These never touch the 402 challenge."""

    declared = _as_tag_list(value, "dimensions", warn)
    if declared is None:
        return None
    malformed: list[str] = []
    named: list[str] = []
    for name in declared:
        if len(name) <= MAX_DIMENSION_CHARS and DIMENSION_NAME.fullmatch(name):
            named.append(name)
        else:
            malformed.append(name)
    if malformed:
        warn(
            f"dropping {len(malformed)} dimension(s) that do not name a field "
            f"(max {MAX_DIMENSION_CHARS} characters, starting with a letter or underscore): "
            f"{', '.join(malformed)}",
            None,
        )
    deduped = list(dict.fromkeys(named))
    if len(deduped) > MAX_DIMENSIONS:
        dropped = deduped[MAX_DIMENSIONS:]
        warn(
            f"dropping {len(deduped) - MAX_DIMENSIONS} dimension(s): at most "
            f"{MAX_DIMENSIONS} travel. Dropped: {', '.join(dropped)}",
            None,
        )
    bounded = deduped[:MAX_DIMENSIONS]
    return bounded or None


def _opaque(field: str, value: object, warn: Warn) -> str | None:
    declared = _as_string(field, value, warn)
    if declared is None:
        return None
    trimmed = declared.strip()
    if trimmed == "":
        warn(f"ignoring empty {field}", None)
        return None
    return trimmed


def _product_extensions(
    route_extensions: object,
    product_type: str | None,
    declaration: Mapping[str, Any],
    warn: Warn,
) -> dict[str, Any] | None:
    product_id = _opaque(
        "productId", declaration.get("productId", declaration.get("product_id")), warn
    )
    manifest_hash = _opaque(
        "manifestHash",
        declaration.get("manifestHash", declaration.get("manifest_hash")),
        warn,
    )
    info: dict[str, str] = {}
    if product_type is not None:
        info["kind"] = product_type
    if product_id is not None:
        info["product_id"] = product_id
    if manifest_hash is not None:
        info["manifest_hash"] = manifest_hash
    if not info:
        return None
    if route_extensions is not None:
        if not isinstance(route_extensions, dict):
            warn(
                f"route extensions {show(route_extensions)} are {type_name(route_extensions)}, "
                "not an object; leaving them untouched and skipping the "
                f"{WEFT_PRODUCT_EXTENSION_KEY} declaration for this route",
                None,
            )
            return None
        if WEFT_PRODUCT_EXTENSION_KEY in route_extensions:
            return None
    base = dict(route_extensions) if isinstance(route_extensions, dict) else {}
    return {
        **base,
        WEFT_PRODUCT_EXTENSION_KEY: {"info": info, "schema": WEFT_PRODUCT_INFO_SCHEMA},
    }


def _apply_to_route(
    route: object,
    identity: Mapping[str, Any],
    warn: Warn,
) -> object:
    if not isinstance(route, dict):
        warn(
            f"ignoring route {show(route)}: expected a route config object, got {type_name(route)}",
            None,
        )
        return route
    rest = dict(route)
    declared_type = rest.pop("type", None)
    declared_service_name = rest.pop("serviceName", rest.pop("service_name", None))
    declared_tags = rest.pop("tags", None)
    declared_icon_url = rest.pop("iconUrl", rest.pop("icon_url", None))
    product_type = resolve_type(declared_type, "route type", warn) or resolve_type(
        identity.get("type"),
        "type",
        warn,
    )
    service_name = resolve_service_name(declared_service_name, identity.get("name"), warn)
    icon_url = resolve_icon_url(
        declared_icon_url, identity.get("iconUrl", identity.get("icon_url")), warn
    )
    tags = resolve_tags(declared_tags, identity.get("tags"), product_type, warn)
    extensions = _product_extensions(rest.get("extensions"), product_type, identity, warn)
    if service_name is not None:
        rest["serviceName"] = service_name
    if tags is not None:
        rest["tags"] = tags
    if icon_url is not None:
        rest["iconUrl"] = icon_url
    if extensions is not None:
        rest["extensions"] = extensions
    elif (
        "extensions" in route
        and extensions is None
        and not isinstance(route.get("extensions"), dict)
    ):
        rest["extensions"] = route["extensions"]
    return rest


def _has_product_identity(identity: Mapping[str, Any]) -> bool:
    return any(
        _declared(identity.get(field))
        for field in (
            "name",
            "type",
            "tags",
            "iconUrl",
            "icon_url",
            "productId",
            "product_id",
            "manifestHash",
            "manifest_hash",
        )
    )


def _has_route_identity(routes: object) -> bool:
    if not isinstance(routes, dict):
        return False
    if _is_single_route(routes):
        return _declared(routes.get("type"))
    return any(
        isinstance(route, dict) and _declared(route.get("type")) for route in routes.values()
    )


def sanitize_product_identity(identity: Mapping[str, Any]) -> dict[str, Any]:
    """Resolve identity the way the challenge does, without a second warning."""

    def silent(_message: str, _key: str | None = None) -> None:
        return None

    product_type = resolve_type(identity.get("type"), "type", silent)
    name = resolve_service_name(None, identity.get("name"), silent)
    icon_url = resolve_icon_url(None, identity.get("iconUrl", identity.get("icon_url")), silent)
    tags = resolve_tags(None, identity.get("tags"), product_type, silent)
    if tags is not None:
        tags = [tag for tag in tags if not _is_reserved_type_tag(tag)]
    result: dict[str, Any] = {}
    if name is not None:
        result["name"] = name
    if product_type is not None:
        result["type"] = product_type
    if tags:
        result["tags"] = tags
    if icon_url is not None:
        result["iconUrl"] = icon_url
    return result


def apply_product_identity(routes: object, identity: Mapping[str, Any] | None) -> object:
    """Merge product identity into every protected route.

    A config with no Weft identity is returned by reference. The input is not
    mutated when identity is applied.
    """

    declaration = identity or {}
    if not isinstance(routes, dict):
        return routes
    if not _has_product_identity(declaration) and not _has_route_identity(routes):
        return routes
    warn = create_warn()
    if _is_single_route(routes):
        return _apply_to_route(routes, declaration, warn)
    return {pattern: _apply_to_route(route, declaration, warn) for pattern, route in routes.items()}
