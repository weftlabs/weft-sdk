"""Stable application error contract for the Python buyer client."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, Literal

from .generated.exceptions import ApiException

# Whether the failed call can have created a charge. "none" covers this call
# only: an earlier call under the same idempotency key can still have paid.
# After "possible", retry only with the same idempotency key and request.
Charge = Literal["none", "possible"]

# Codes Weft raises before it signs a payment in that call. Same list as the
# TypeScript reference.
PRE_SIGN_FETCH_CODES = frozenset(
    {
        "EXCEEDED_MAX_COST",
        "MERCHANT_RETURNED_NON_402",
        "INSUFFICIENT_BALANCE",
        "DENYLISTED_RECIPIENT",
        "WALLET_ENVIRONMENT_MISMATCH",
        "UNSUPPORTED_ASSET",
        "INVALID_REQUEST",
        "UNKNOWN_PARAMETER",
        "INVALID_URL",
        "INVALID_MAX_COST_USD",
        "UNSUPPORTED_METHOD",
        "INVALID_BODY",
        "INVALID_HEADERS",
        "INVALID_IDEMPOTENCY_KEY",
    }
)


def fetch_charge(status: int, code: str) -> Charge:
    pre_sign = code in PRE_SIGN_FETCH_CODES or code.startswith("POLICY_VIOLATION_")
    return "none" if 400 <= status < 500 and pre_sign else "possible"


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
        charge: Charge = "none",
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id
        self.retryable = retryable
        self.details = details
        self.charge: Charge = charge


def normalize_api_exception(error: ApiException, *, paid: bool = False) -> WeftError:
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

    code = str(code or f"HTTP_{status}")
    return WeftError(
        status=status,
        code=code,
        message=str(message),
        request_id=str(request_id) if request_id else None,
        retryable=status == 429 or status >= 500,
        details=details,
        charge=fetch_charge(status, code) if paid else "none",
    )
