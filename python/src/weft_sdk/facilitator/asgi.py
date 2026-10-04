"""Pure ASGI payment middleware for Starlette and FastAPI.

Importing this module does not import FastAPI. The wire challenge, verify, and
settle calls go through the upstream ``x402`` HTTP resource server.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, cast
from urllib.parse import parse_qs

from x402.http import x402HTTPResourceServer
from x402.http.constants import SETTLEMENT_OVERRIDES_HEADER
from x402.http.types import HTTPProcessResult, HTTPRequestContext, HTTPTransportContext
from x402.schemas.hooks import VerifiedPaymentCancellationReason, VerifiedPaymentCancelOptions
from x402.server import x402ResourceServer

from .client import WeftFacilitatorConfig, create_facilitator_client
from .extensions import register_dynamic_extensions
from .handshake import ADAPTER_NAME, build_facilitator_auth_headers
from .product import apply_product_identity
from .replay import payment_resume_candidate, resume_payment_result
from .settlement import (
    SETTLEMENT_HTTP_METHOD,
    before_handler_flow,
    completed_before_settlement,
    is_facilitator_unavailable,
    is_facilitator_unavailable_response,
    is_json_response,
    payment_response_headers,
    settles_after_handler,
    with_private_cache_control,
)
from .warn import console_warn

FACILITATOR_SYNC_RETRY_FLOOR_S = 30.0
Scope = dict[str, Any]
Message = dict[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


class _ASGIAdapter:
    """Framework-agnostic request view for one ASGI HTTP scope."""

    def __init__(self, scope: Scope, body: bytes) -> None:
        self._scope = scope
        self._body = body
        self._headers = {
            name.decode("latin-1").lower(): value.decode("latin-1")
            for name, value in scope.get("headers", [])
        }

    def get_header(self, name: str) -> str | None:
        return self._headers.get(name.lower())

    def get_method(self) -> str:
        method = self._scope.get("method", "GET")
        return str(method)

    def get_path(self) -> str:
        return str(self._scope.get("path", "/"))

    def get_url(self) -> str:
        scheme = self._scope.get("scheme", "http")
        host = self.get_header("host") or "localhost"
        return f"{scheme}://{host}{self.get_path()}"

    def get_accept_header(self) -> str:
        return self.get_header("accept") or ""

    def get_user_agent(self) -> str:
        return self.get_header("user-agent") or ""

    def get_query_params(self) -> dict[str, str | list[str]]:
        parsed = parse_qs(
            self._scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True
        )
        return {key: values if len(values) > 1 else values[0] for key, values in parsed.items()}

    def get_query_param(self, name: str) -> str | list[str] | None:
        return self.get_query_params().get(name)

    def get_body(self) -> Any:
        if not self._body:
            return None
        content_type = self.get_header("content-type") or ""
        if content_type.startswith("application/json"):
            try:
                return json.loads(self._body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self._body
        return self._body


def _config_value(config: Mapping[str, Any] | None, *names: str, default: Any = None) -> Any:
    if not config:
        return default
    for name in names:
        if name in config and config[name] is not None:
            return config[name]
    return default


def _header_value(headers: list[tuple[bytes, bytes]], name: str) -> str | None:
    target = name.lower().encode("latin-1")
    for key, value in headers:
        if key.lower() == target:
            return value.decode("latin-1")
    return None


def _without_header(headers: list[tuple[bytes, bytes]], name: str) -> list[tuple[bytes, bytes]]:
    target = name.lower().encode("latin-1")
    return [(key, value) for key, value in headers if key.lower() != target]


def _upsert_header(
    headers: list[tuple[bytes, bytes]], name: str, value: str
) -> list[tuple[bytes, bytes]]:
    kept = _without_header(headers, name)
    kept.append((name.lower().encode("latin-1"), value.encode("latin-1")))
    return kept


async def _read_body(receive: Receive) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        if message["type"] != "http.request":
            continue
        chunks.append(message.get("body", b"") or b"")
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def _replay_receive(body: bytes) -> Receive:
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


async def _send_response(
    send: Send, status: int, headers: list[tuple[bytes, bytes]], body: bytes
) -> None:
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


def _encode_body(response: Any) -> tuple[list[tuple[bytes, bytes]], bytes]:
    headers = getattr(response, "headers", {}) or {}
    raw = [
        (str(name).encode("latin-1"), str(value).encode("latin-1"))
        for name, value in headers.items()
    ]
    body = getattr(response, "body", None)
    if is_json_response(response):
        payload = (
            b"{}"
            if body is None
            else json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        )
        return raw, payload
    if isinstance(body, bytes):
        return raw, body
    if isinstance(body, str):
        return raw, body.encode("utf-8")
    if body is None:
        return raw, b""
    return raw, str(body).encode("utf-8")


async def _send_with_settlement(
    send: Send,
    status: int,
    response_headers: list[tuple[bytes, bytes]],
    body: bytes,
    settlement_headers: Mapping[str, str],
) -> None:
    headers = list(response_headers)
    for name, value in settlement_headers.items():
        headers = _upsert_header(headers, name, value)
    existing = _header_value(headers, "cache-control")
    headers = _upsert_header(headers, "cache-control", with_private_cache_control(existing))
    headers = _without_header(headers, SETTLEMENT_OVERRIDES_HEADER)
    await _send_response(send, status, headers, body)


def _unavailable_response() -> tuple[int, list[tuple[bytes, bytes]], bytes]:
    headers = [
        (b"retry-after", b"1"),
        (b"cache-control", with_private_cache_control(None).encode("latin-1")),
        (b"content-type", b"application/json; charset=UTF-8"),
    ]
    return 503, headers, b'{"error":"facilitator_unavailable"}'


class WeftASGIMiddleware:
    """ASGI middleware that requires x402 payment for the configured routes.

    ``routes`` uses the same shape as the TypeScript middleware: a path map or
    one route object. Product fields on ``config`` are applied to every
    protected route.
    """

    def __init__(
        self,
        app: ASGIApp,
        routes: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
        *,
        routes_config: Mapping[str, Any] | None = None,
    ) -> None:
        self.app = app
        route_map = routes if routes is not None else routes_config
        if route_map is None:
            raise TypeError("routes is required")
        self._config = dict(config or {})
        facilitator = _config_value(self._config, "facilitator")
        facilitator_config: WeftFacilitatorConfig | None = (
            dict(facilitator) if isinstance(facilitator, Mapping) else None
        )
        auth_headers = build_facilitator_auth_headers(
            ADAPTER_NAME,
            _config_value(self._config, "api_key", "apiKey"),
            self._config,
        )
        self._client = create_facilitator_client(facilitator_config, auth_headers)
        resource_server = x402ResourceServer(self._client)
        register_dynamic_extensions(resource_server, route_map)
        for registration in _config_value(self._config, "schemes", default=[]) or []:
            if isinstance(registration, Mapping):
                network = registration.get("network")
                scheme_server = registration.get("server")
            else:
                network = getattr(registration, "network", None)
                scheme_server = getattr(registration, "server", None)
            if network is None or scheme_server is None:
                raise TypeError("schemes entries need network and server")
            resource_server.register(network, scheme_server)
        applied = apply_product_identity(route_map, self._config)
        self._http = x402HTTPResourceServer(resource_server, cast(Any, applied))
        paywall = _config_value(self._config, "paywall")
        if paywall is not None:
            self._http.register_paywall_provider(paywall)
        self._paywall_config = _config_value(self._config, "paywall_config", "paywallConfig")
        self._resume = _config_value(
            self._config,
            "resume_verified_payment",
            "resumeVerifiedPayment",
        )
        self._sync_on_start = bool(
            _config_value(
                self._config,
                "sync_facilitator_on_start",
                "syncFacilitatorOnStart",
                default=True,
            )
        )
        self._synced = False
        self._in_flight = False
        self._last_failed = 0.0
        self._boot_done = threading.Event()
        self._lock = threading.Lock()
        self._warned_missing_before = False
        if self._sync_on_start:
            self._start_sync(boot=True)
        else:
            self._boot_done.set()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        method = str(scope.get("method", "GET"))
        path = str(scope.get("path", "/"))
        preview = _ASGIAdapter(scope, b"")
        context = HTTPRequestContext(adapter=preview, path=path, method=method)
        if not self._http.requires_payment(context):
            await self.app(scope, receive, send)
            return
        await self._wait_for_boot()
        self._maybe_retry_sync()
        method_token = SETTLEMENT_HTTP_METHOD.set(method.upper())
        try:
            await self._handle_protected(scope, receive, send, method, path)
        finally:
            SETTLEMENT_HTTP_METHOD.reset(method_token)

    async def _handle_protected(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        method: str,
        path: str,
    ) -> None:
        body = await _read_body(receive)
        adapter = _ASGIAdapter(scope, body)
        payment_header = adapter.get_header("payment-signature") or adapter.get_header("x-payment")
        request_context = HTTPRequestContext(
            adapter=adapter,
            path=path,
            method=method,
            payment_header=payment_header,
        )
        try:
            result = await self._process(request_context)
        except Exception:
            raise
        if _result_type(result) == "no-payment-required":
            await self.app(scope, _replay_receive(body), send)
            return
        if _result_type(result) == "payment-error":
            response = _result_field(result, "response")
            if response is not None and is_facilitator_unavailable_response(response):
                status, headers, payload = _unavailable_response()
                await _send_response(send, status, headers, payload)
                return
            headers, payload = _encode_body(response)
            await _send_response(send, int(getattr(response, "status", 402)), headers, payload)
            return
        if _result_type(result) != "payment-verified":
            await self.app(scope, _replay_receive(body), send)
            return
        await self._run_paid(scope, body, send, request_context, result)

    async def _process(self, context: HTTPRequestContext) -> Any:
        candidate = payment_resume_candidate(context)
        resumed = None
        if candidate is not None and self._resume is not None:
            resumed = self._resume(context, candidate)
            if isinstance(resumed, Awaitable):
                resumed = await resumed
        if resumed:
            built = resume_payment_result(self._http._server, resumed, context)  # noqa: SLF001
            requirements = built["paymentRequirements"]
            verified = HTTPProcessResult(
                type="payment-verified",
                payment_payload=built["paymentPayload"],
                payment_requirements=requirements,
                declared_extensions=built.get("declaredExtensions"),
                cancellation_dispatcher=built.get("cancellationDispatcher"),
                before_handler_settlement=completed_before_settlement(
                    built.get("beforeHandlerSettlement"),
                    requirements,
                ),
            )
            return verified
        return await self._http.process_http_request(context, self._paywall_config)

    async def _run_paid(
        self,
        scope: Scope,
        body: bytes,
        send: Send,
        context: HTTPRequestContext,
        result: Any,
    ) -> None:
        payload = _result_field(result, "payment_payload", "paymentPayload")
        requirements = _result_field(result, "payment_requirements", "paymentRequirements")
        declared = _result_field(result, "declared_extensions", "declaredExtensions")
        dispatcher = _result_field(result, "cancellation_dispatcher", "cancellationDispatcher")
        status = 500
        response_headers: list[tuple[bytes, bytes]] = []
        chunks: list[bytes] = []
        complete = False

        async def capture(message: Message) -> None:
            nonlocal status, complete
            if message["type"] == "http.response.start":
                status = int(message["status"])
                response_headers[:] = list(message.get("headers") or [])
                return
            if message["type"] == "http.response.body":
                chunks.append(message.get("body", b"") or b"")
                if not message.get("more_body", False):
                    complete = True

        try:
            await self.app(scope, _replay_receive(body), capture)
        except Exception as error:
            await _cancel(dispatcher, "handler_threw", error=error)
            raise
        if not complete or status >= 400:
            await _cancel(
                dispatcher,
                "handler_failed",
                response_status=status if complete else 500,
            )
            if complete:
                await _send_response(send, status, response_headers, b"".join(chunks))
            else:
                await _send_response(
                    send,
                    500,
                    [(b"content-type", b"application/json")],
                    b"{}",
                )
            return
        header_record = {
            key.decode("latin-1"): value.decode("latin-1") for key, value in response_headers
        }
        overrides = None
        raw_overrides = _header_value(response_headers, SETTLEMENT_OVERRIDES_HEADER)
        if raw_overrides:
            try:
                parsed = json.loads(raw_overrides)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                overrides = parsed
        before = getattr(result, "before_handler_settlement", None)
        flow = before_handler_flow(before)
        if flow is not None and not settles_after_handler(flow):
            echoed: dict[str, str] = {}
            if isinstance(before, Mapping):
                echoed = payment_response_headers(before.get("result"))
            elif before is not None:
                echoed = payment_response_headers(getattr(before, "result", None))
            if not echoed and not self._warned_missing_before:
                self._warned_missing_before = True
                console_warn(
                    "[weft] payment flow settles before the handler, but no "
                    "before-handler settlement was restored; skipping after-handler settle"
                )
            await _send_with_settlement(
                send,
                status,
                response_headers,
                b"".join(chunks),
                echoed,
            )
            return
        settle_result = await self._http.process_settlement(
            payload,
            requirements,
            context=context,
            settlement_overrides=overrides,
            declared_extensions=declared,
            transport_context=HTTPTransportContext(
                request=context,
                response_body=b"".join(chunks),
                response_headers=header_record,
            ),
        )
        if not getattr(settle_result, "success", False):
            if is_facilitator_unavailable(getattr(settle_result, "error_reason", None)):
                status_code, headers, payload_bytes = _unavailable_response()
                await _send_response(send, status_code, headers, payload_bytes)
                return
            failure = getattr(settle_result, "response", None)
            if failure is not None and is_facilitator_unavailable_response(failure):
                status_code, headers, payload_bytes = _unavailable_response()
                await _send_response(send, status_code, headers, payload_bytes)
                return
            if failure is not None:
                headers, payload_bytes = _encode_body(failure)
                await _send_response(
                    send, int(getattr(failure, "status", 402)), headers, payload_bytes
                )
                return
            await _send_response(
                send,
                402,
                [(b"content-type", b"application/json")],
                b"{}",
            )
            return
        settle_headers = getattr(settle_result, "headers", None) or {}
        await _send_with_settlement(
            send,
            status,
            response_headers,
            b"".join(chunks),
            {str(name): str(value) for name, value in settle_headers.items()},
        )

    async def _wait_for_boot(self) -> None:
        if self._boot_done.is_set():
            return
        await asyncio.to_thread(self._boot_done.wait)

    def _maybe_retry_sync(self) -> None:
        if not self._sync_on_start or self._synced:
            return
        if time.monotonic() - self._last_failed < FACILITATOR_SYNC_RETRY_FLOOR_S:
            return
        self._start_sync(boot=False)

    def _start_sync(self, *, boot: bool) -> None:
        with self._lock:
            if self._in_flight:
                return
            self._in_flight = True

        def run() -> None:
            try:
                self._http.initialize()
                self._synced = True
            except Exception as error:  # noqa: BLE001 - boot must not kill the process
                self._last_failed = time.monotonic()
                console_warn(
                    "[weft] facilitator sync failed; payment-protected routes "
                    "degrade until a later attempt succeeds: "
                    f"{error}"
                )
            finally:
                self._in_flight = False
                if boot:
                    self._boot_done.set()

        threading.Thread(target=run, name="weft-facilitator-sync", daemon=True).start()


def weft_payment_middleware(
    app: ASGIApp,
    routes: Mapping[str, Any],
    config: Mapping[str, Any] | None = None,
) -> WeftASGIMiddleware:
    """Wrap an ASGI app with Weft payment protection."""

    return WeftASGIMiddleware(app, routes, config)


def _result_type(result: Any) -> str | None:
    if isinstance(result, HTTPProcessResult):
        return result.type
    if isinstance(result, Mapping):
        value = result.get("type")
        return str(value) if value is not None else None
    value = getattr(result, "type", None)
    return str(value) if value is not None else None


def _result_field(result: Any, *names: str) -> Any:
    if isinstance(result, Mapping):
        for name in names:
            if name in result:
                return result[name]
        return None
    for name in names:
        if hasattr(result, name):
            value = getattr(result, name)
            if value is not None or name == names[-1]:
                return value
    return None


async def _cancel(
    dispatcher: Any,
    reason: VerifiedPaymentCancellationReason,
    error: BaseException | None = None,
    response_status: int | None = None,
) -> None:
    if dispatcher is None:
        return
    options = VerifiedPaymentCancelOptions(
        reason=reason,
        error=error,
        response_status=response_status,
    )
    cancel = getattr(dispatcher, "cancel", None)
    if cancel is None:
        return
    result = cancel(options)
    if isinstance(result, Awaitable):
        await result
