"""Warning sink shared by the seller facilitator contracts."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable

Warn = Callable[[str, str | None], None]


def console_warn(message: str) -> None:
    """Emit one seller diagnostic.

    The API key never belongs in this line. Callers must name the field and
    must not quote the credential.
    """

    print(message, file=sys.stderr)


def create_warn() -> Warn:
    """Return a sink that emits each distinct problem once."""

    seen: set[str] = set()

    def warn(message: str, dedupe_key: str | None = None) -> None:
        key = message if dedupe_key is None else dedupe_key
        if key in seen:
            return
        seen.add(key)
        console_warn(f"[weft] {message}")

    return warn


def type_name(value: object) -> str:
    """Name a value the way the TypeScript diagnostics do."""

    if value is None:
        return "null"
    if isinstance(value, list):
        return "an array"
    if isinstance(value, bool):
        return "a boolean"
    if isinstance(value, (int, float)):
        return "a number"
    if isinstance(value, str):
        return "a string"
    if isinstance(value, dict):
        return "a object"
    return f"a {type(value).__name__}"


def show(value: object) -> str:
    """Render a value for a diagnostic without raising."""

    try:
        rendered = json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return type_name(value)
    if rendered == "null" and value is not None:
        return type_name(value)
    return rendered if rendered is not None else type_name(value)
