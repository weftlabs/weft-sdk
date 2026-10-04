"""Stable application error contract for the Python buyer client."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from .generated.exceptions import ApiException


class WeftError(Exception):
    def __init__(
        self,
        *,
        status: int,
        code: str,
        message: str,
        request_id: str | None,
        retryable: bool,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.retryable = retryable
        self.details = details


def normalize_api_exception(error: ApiException) -> WeftError:
    status = int(error.status or 0)
    details: Any = None
    if error.body:
        try:
            details = json.loads(error.body)
        except (TypeError, json.JSONDecodeError):
            details = None

    body = details if isinstance(details, Mapping) else {}
    raw_nested = body.get("error")
    nested = raw_nested if isinstance(raw_nested, Mapping) else {}
    code = nested.get("code") or body.get("code")
    if not code and isinstance(raw_nested, str):
        code = raw_nested
    message = nested.get("message") or body.get("message") or f"Weft API returned HTTP {status}"
    request_id = nested.get("request_id") or body.get("request_id")
    if not request_id and error.headers:
        request_id = error.headers.get("x-request-id")

    return WeftError(
        status=status,
        code=str(code or f"HTTP_{status}"),
        message=str(message),
        request_id=str(request_id) if request_id else None,
        retryable=status == 429 or status >= 500,
        details=details,
    )
