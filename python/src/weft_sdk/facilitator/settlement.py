"""Settlement-phase classification and the protected HTTP method."""

from __future__ import annotations

import re
from collections.abc import Mapping
from contextvars import ContextVar
from typing import Any

FACILITATOR_UNAVAILABLE_ERROR = "weft:facilitator-settle-unavailable"
CORE_FACILITATOR_UNAVAILABLE = re.compile(r"^Facilitator settle failed \(503\):(?: |$)")
SETTLEMENT_HTTP_METHOD: ContextVar[str | None] = ContextVar(
    "weft_settlement_http_method",
    default=None,
)


def is_facilitator_unavailable(error_reason: str | None) -> bool:
    """Return true for the Weft token or Core's exact 503 settle prefix."""

    if error_reason is None:
        return False
    return (
        error_reason == FACILITATOR_UNAVAILABLE_ERROR
        or CORE_FACILITATOR_UNAVAILABLE.search(error_reason) is not None
    )


def _header(headers: dict[str, Any], name: str) -> str | None:
    for key, value in headers.items():
        if key.lower() == name:
            if isinstance(value, list):
                return str(value[0]) if value else None
            return None if value is None else str(value)
    return None


def is_facilitator_unavailable_response(response: Any) -> bool:
    """Return true when a Core response already says the facilitator is down."""

    body = getattr(response, "body", None)
    if isinstance(response, dict):
        body = response.get("body", body)
    if isinstance(body, dict):
        for field in ("errorReason", "error_reason", "error"):
            value = body.get(field)
            if isinstance(value, str) and is_facilitator_unavailable(value):
                return True
    headers = getattr(response, "headers", None)
    if isinstance(response, dict):
        headers = response.get("headers", headers)
    if not isinstance(headers, dict):
        return False
    payment_response = _header(headers, "payment-response")
    if not payment_response:
        return False
    try:
        from x402.http import decode_payment_response_header

        decoded = decode_payment_response_header(payment_response)
    except Exception:  # noqa: BLE001 - a bad header is not an unavailable signal
        return False
    reason = getattr(decoded, "error_reason", None)
    return isinstance(reason, str) and is_facilitator_unavailable(reason)


def is_json_response(response: Any) -> bool:
    """Return true when Core marked the body as JSON."""

    headers = getattr(response, "headers", None)
    if isinstance(response, dict):
        headers = response.get("headers", headers)
    if not isinstance(headers, dict):
        return False
    content_type = _header(headers, "content-type") or ""
    return (
        re.search(r"^(application/json|[^;]+\+json)(?:;|$)", content_type, re.IGNORECASE)
        is not None
    )


# Same phases as @x402/core PAYMENT_FLOWS. (settle before handler, settle after handler)
_PAYMENT_FLOW_PHASES = {
    "authorization": (False, True),
    "upfront": (True, False),
    "escrow": (True, True),
}


def completed_before_settlement(value: object, requirements: object) -> Any:
    """Build an x402 CompletedSettlement, or None when the receipt is incomplete."""

    from x402.schemas import CompletedSettlement, PaymentRequirements, SettleResponse

    if value is None:
        return None
    if isinstance(value, CompletedSettlement):
        return value
    if not isinstance(value, Mapping):
        return None
    raw_flow = value.get("flow")
    if raw_flow == "authorization" or raw_flow == "upfront" or raw_flow == "escrow":
        flow = raw_flow
    else:
        return None
    raw_result = value.get("result")
    if isinstance(raw_result, SettleResponse):
        result = raw_result
    elif isinstance(raw_result, Mapping):
        result = SettleResponse.model_validate(raw_result)
    else:
        return None
    raw_requirements = value.get("requirements", requirements)
    if isinstance(raw_requirements, PaymentRequirements):
        matched = raw_requirements
    elif isinstance(raw_requirements, Mapping):
        matched = PaymentRequirements.model_validate(raw_requirements)
    else:
        return None
    return CompletedSettlement(
        phase="before-handler",
        flow=flow,
        result=result,
        requirements=matched,
    )


def before_handler_flow(before: object) -> str | None:
    """Return the flow name carried on a restored before-handler settlement."""

    if isinstance(before, Mapping):
        flow = before.get("flow")
    else:
        flow = getattr(before, "flow", None)
    return flow if isinstance(flow, str) else None


def settles_after_handler(flow: str) -> bool:
    """Return whether Core settles again after the handler for this flow."""

    phases = _PAYMENT_FLOW_PHASES.get(flow)
    if phases is None:
        known = ", ".join(_PAYMENT_FLOW_PHASES)
        raise ValueError(f'[x402] Unknown payment flow "{flow}". Expected one of: {known}.')
    return phases[1]


def payment_response_headers(result: object) -> dict[str, str]:
    """Encode a completed settle result as the PAYMENT-RESPONSE header."""

    from x402.http.utils import encode_payment_response_header
    from x402.schemas import SettleResponse

    if isinstance(result, SettleResponse):
        model = result
    elif isinstance(result, Mapping):
        model = SettleResponse.model_validate(result)
    else:
        return {}
    return {"PAYMENT-RESPONSE": encode_payment_response_header(model)}


def with_private_cache_control(value: str | None) -> str:
    """Match @x402/core withPrivateCacheControl."""

    if not value:
        return "private"
    directives = [part.strip().lower() for part in value.split(",")]
    if "private" in directives:
        return value
    return f"{value}, private"
