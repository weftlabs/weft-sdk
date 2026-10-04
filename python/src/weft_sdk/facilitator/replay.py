"""Restore a previously verified payment for settlement replay."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from x402.http import decode_payment_signature_header
from x402.schemas import PaymentPayload

PaymentResumeCandidate = dict[str, Any]
VerifiedPaymentResume = dict[str, Any]
ResumeVerifiedPayment = Callable[
    [Any, PaymentResumeCandidate],
    VerifiedPaymentResume | None | Awaitable[VerifiedPaymentResume | None],
]


def payment_resume_candidate(context: Any) -> PaymentResumeCandidate | None:
    """Decode a structurally valid v2 payment before the replay trust boundary."""

    header = getattr(context, "payment_header", None)
    if header is None and isinstance(context, dict):
        header = context.get("paymentHeader", context.get("payment_header"))
    if not header:
        return None
    try:
        payment_payload = decode_payment_signature_header(header)
        if not isinstance(payment_payload, PaymentPayload):
            return None
        if payment_payload.x402_version != 2:
            return None
    except Exception:  # noqa: BLE001 - a bad header is not a resume candidate
        return None
    return {
        "paymentPayload": payment_payload,
        "paymentRequirements": payment_payload.accepted,
    }


def resume_payment_result(
    resource_server: Any,
    resumed: VerifiedPaymentResume,
    context: Any,
) -> dict[str, Any]:
    """Build the payment-verified result Core would have returned."""

    before = resumed.get("beforeHandlerSettlement", resumed.get("before_handler_settlement"))
    dispatcher = resumed.get("cancellationDispatcher", resumed.get("cancellation_dispatcher"))
    if dispatcher is None:
        dispatcher = resource_server.create_payment_cancellation_dispatcher(
            resumed["paymentPayload"],
            resumed["paymentRequirements"],
            resumed.get("declaredExtensions", resumed.get("declared_extensions")),
            {"request": context},
        )
    return {
        "type": "payment-verified",
        "paymentPayload": resumed["paymentPayload"],
        "paymentRequirements": resumed["paymentRequirements"],
        "declaredExtensions": resumed.get("declaredExtensions", resumed.get("declared_extensions")),
        "beforeHandlerSettlement": before,
        "cancellationDispatcher": dispatcher,
    }
