"""Seller middleware proof against a real facilitator socket."""

from __future__ import annotations

import asyncio
import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from x402.http import decode_payment_required_header, decode_payment_response_header
from x402.schemas import AssetAmount

from weft_sdk.facilitator.asgi import WeftASGIMiddleware
from weft_sdk.facilitator.handshake import sdk_version

NETWORK = "eip155:84532"
ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
PAY_TO = "0x0000000000000000000000000000000000000001"
API_KEY = "wk_live_abc"


class ExactScheme:
    scheme = "exact"

    def parse_price(self, price: object, network: str) -> AssetAmount:
        del price, network
        return AssetAmount(amount="10000", asset=ASSET)

    def enhance_payment_requirements(
        self,
        requirements: Any,
        supported_kind: Any,
        extensions: list[str],
    ) -> Any:
        del supported_kind, extensions
        return requirements


class FacilitatorState:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.settle_mode = "ok"
        self.supported_status = 200
        self.lock = threading.Lock()

    def record(self, method: str, path: str, headers: dict[str, str], body: bytes) -> None:
        with self.lock:
            self.calls.append(
                {
                    "method": method,
                    "path": path,
                    "headers": headers,
                    "body": body,
                }
            )

    def snapshot(self) -> list[dict[str, Any]]:
        with self.lock:
            return list(self.calls)


def _facilitator(state: FacilitatorState) -> tuple[ThreadingHTTPServer, str]:
    class Handler(BaseHTTPRequestHandler):
        def _read(self) -> bytes:
            length = int(self.headers.get("Content-Length", "0"))
            return self.rfile.read(length) if length else b""

        def _headers(self) -> dict[str, str]:
            return {key: value for key, value in self.headers.items()}

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            raw = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:  # noqa: N802
            state.record("GET", self.path, self._headers(), b"")
            if self.path.split("?", 1)[0] != "/supported":
                self._json(404, {"error": "not found"})
                return
            if state.supported_status != 200:
                self._json(state.supported_status, {"error": "down"})
                return
            self._json(
                200,
                {
                    "kinds": [{"x402Version": 2, "scheme": "exact", "network": NETWORK}],
                    "extensions": [],
                    "signers": {},
                    "fee": {"amount": "0.001", "asset": "USDC", "network": NETWORK},
                },
            )

        def do_POST(self) -> None:  # noqa: N802
            body = self._read()
            state.record("POST", self.path, self._headers(), body)
            path = self.path.split("?", 1)[0]
            if path == "/verify":
                self._json(200, {"isValid": True, "payer": "0xpayer"})
                return
            if path == "/settle":
                if state.settle_mode == "drop":
                    self.connection.close()
                    return
                if state.settle_mode == "down":
                    self._json(
                        503,
                        {
                            "success": False,
                            "errorReason": "temporarily_unavailable",
                            "transaction": "",
                            "network": NETWORK,
                        },
                    )
                    return
                self._json(
                    200,
                    {
                        "success": True,
                        "transaction": "0xtx",
                        "network": NETWORK,
                        "payer": "0xpayer",
                    },
                )
                return
            self._json(404, {"error": "not found"})

        def log_message(self, fmt: str, *args: object) -> None:
            del fmt, args

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


def _app(handler_status: int, calls: list[str]) -> Any:
    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        del receive
        calls.append(scope["method"])
        body = b'{"ok":true}'
        await send(
            {
                "type": "http.response.start",
                "status": handler_status,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": body})

    return app


def _request_extension(context: Any) -> dict[str, str]:
    return {"model": context.adapter.get_header("x-model") or ""}


def _middleware(
    facilitator_url: str,
    *,
    api_key: object = API_KEY,
    handler_status: int = 200,
    calls: list[str] | None = None,
    resume: Any = None,
    scheme: Any = None,
) -> WeftASGIMiddleware:
    return WeftASGIMiddleware(
        _app(handler_status, calls if calls is not None else []),
        {
            "* /v1/search": {
                "accepts": {
                    "scheme": "exact",
                    "network": NETWORK,
                    "payTo": PAY_TO,
                    "price": "$0.01",
                },
                "extensions": {"weft.request": _request_extension},
            }
        },
        {
            "apiKey": api_key,
            "name": "Acme Pricing API",
            "type": "api",
            "productId": "prod_1",
            "facilitator": {"url": facilitator_url},
            "schemes": [{"network": NETWORK, "server": scheme or ExactScheme()}],
            "resumeVerifiedPayment": resume,
        },
    )


async def _http(
    app: Any,
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes = b"",
) -> tuple[int, dict[str, str], bytes]:
    server = await asyncio.start_server(_handler(app), "127.0.0.1", 0)
    sockets = server.sockets or []
    port = sockets[0].getsockname()[1]
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        raw_headers = {"host": f"127.0.0.1:{port}", "content-length": str(len(body))}
        raw_headers.update({key.lower(): value for key, value in (headers or {}).items()})
        request = [f"{method} {path} HTTP/1.1"]
        request.extend(f"{key}: {value}" for key, value in raw_headers.items())
        writer.write(("\r\n".join(request) + "\r\n\r\n").encode() + body)
        await writer.drain()
        status, response_headers, payload = await _read_response(reader)
        writer.close()
        await writer.wait_closed()
        return status, response_headers, payload
    finally:
        server.close()
        await server.wait_closed()


def _handler(app: Any) -> Any:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        header = await reader.readuntil(b"\r\n\r\n")
        lines = header.decode("latin-1").split("\r\n")
        method, target, _version = lines[0].split(" ")
        path, _, query = target.partition("?")
        incoming = {}
        for line in lines[1:]:
            if not line:
                continue
            name, value = line.split(":", 1)
            incoming[name.lower()] = value.strip()
        length = int(incoming.get("content-length", "0"))
        body = await reader.readexactly(length) if length else b""
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": query.encode(),
            "headers": [(key.encode(), value.encode()) for key, value in incoming.items()],
            "client": ("127.0.0.1", 0),
            "server": ("127.0.0.1", 0),
        }

        async def receive() -> dict[str, Any]:
            return {"type": "http.request", "body": body, "more_body": False}

        started = False

        async def send(message: dict[str, Any]) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                status = message["status"]
                pairs = message.get("headers") or []
                payload_hint = b""
                writer.write(f"HTTP/1.1 {status} OK\r\n".encode())
                for key, value in pairs:
                    writer.write(key + b": " + value + b"\r\n")
                writer.write(b"\r\n")
                del payload_hint
            elif message["type"] == "http.response.body":
                writer.write(message.get("body", b"") or b"")
                if not message.get("more_body", False):
                    await writer.drain()
            if started:
                await writer.drain()

        try:
            await app(scope, receive, send)
        finally:
            writer.close()
            await writer.wait_closed()

    return handle


async def _read_response(reader: asyncio.StreamReader) -> tuple[int, dict[str, str], bytes]:
    header = await reader.readuntil(b"\r\n\r\n")
    lines = header.decode("latin-1").split("\r\n")
    status = int(lines[0].split(" ")[1])
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            continue
        name, value = line.split(":", 1)
        headers[name.lower()] = value.strip()
    length = int(headers.get("content-length", "0"))
    if length:
        body = await reader.readexactly(length)
    else:
        body = await reader.read()
    return status, headers, body


def _payment_header(challenge: Any) -> str:
    accepted = challenge.accepts[0].model_dump(by_alias=True, exclude_none=True)
    payload = {"x402Version": 2, "payload": {"signature": "test"}, "accepted": accepted}
    return base64.b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()


def _calls(state: FacilitatorState, path: str) -> list[dict[str, Any]]:
    return [call for call in state.snapshot() if call["path"].split("?", 1)[0] == path]


@pytest.mark.asyncio
async def test_unpaid_paid_error_and_facilitator_down(capsys: pytest.CaptureFixture[str]) -> None:
    state = FacilitatorState()
    server, url = _facilitator(state)
    calls: list[str] = []
    app = _middleware(url, calls=calls)
    try:
        status, headers, body = await _http(app, "GET", "/v1/search", {"x-model": "gpt"})
        assert status == 402
        assert body == b"{}"
        challenge = decode_payment_required_header(headers["payment-required"])
        dumped = challenge.model_dump(by_alias=True)
        assert dumped["resource"]["serviceName"] == "Acme Pricing API"
        assert dumped["extensions"]["weft.product"]["info"] == {
            "kind": "api",
            "product_id": "prod_1",
        }
        assert dumped["extensions"]["weft.request"]["info"] == {"model": "gpt"}
        assert "schema" in dumped["extensions"]["weft.request"]
        other = await _http(app, "GET", "/v1/search", {"x-model": "haiku"})
        other_challenge = decode_payment_required_header(other[1]["payment-required"])
        assert other_challenge.model_dump(by_alias=True)["extensions"]["weft.request"]["info"] == {
            "model": "haiku"
        }

        paid_status, paid_headers, paid_body = await _http(
            app,
            "POST",
            "/v1/search",
            {
                "x-model": "gpt",
                "payment-signature": _payment_header(challenge),
            },
        )
        assert paid_status == 200
        assert paid_body == b'{"ok":true}'
        assert calls == ["POST"]
        verify = _calls(state, "/verify")
        settle = _calls(state, "/settle")
        assert len(verify) == 1
        assert len(settle) == 1
        assert verify[0]["headers"]["X-API-Key"] == API_KEY
        assert settle[0]["headers"]["X-API-Key"] == API_KEY
        settle_body = json.loads(settle[0]["body"])
        assert settle_body["paymentPayload"]["httpMethod"] == "POST"
        receipt = decode_payment_response_header(paid_headers["payment-response"])
        assert receipt.success is True
        assert receipt.transaction == "0xtx"
        supported = _calls(state, "/supported")
        assert supported
        assert supported[0]["headers"]["User-Agent"] == f"weft-sdk-asgi/{sdk_version()}"
        assert supported[0]["headers"]["Authorization"] == f"Bearer {API_KEY}"

        error_calls: list[str] = []
        error_app = _middleware(url, handler_status=500, calls=error_calls)
        before = len(_calls(state, "/settle"))
        error_status, _, _ = await _http(
            error_app,
            "POST",
            "/v1/search",
            {"payment-signature": _payment_header(challenge), "x-model": "gpt"},
        )
        assert error_status == 500
        assert error_calls == ["POST"]
        assert len(_calls(state, "/settle")) == before

        state.settle_mode = "down"
        down_status, down_headers, down_body = await _http(
            app,
            "POST",
            "/v1/search",
            {"payment-signature": _payment_header(challenge), "x-model": "gpt"},
        )
        assert down_status == 503
        assert json.loads(down_body) == {"error": "facilitator_unavailable"}
        assert down_headers["retry-after"] == "1"
        assert down_headers["cache-control"] == "private"
        assert "payment-response" not in down_headers
    finally:
        server.shutdown()
        server.server_close()
        captured = capsys.readouterr()
        assert API_KEY not in captured.err
        assert API_KEY not in captured.out


@pytest.mark.asyncio
async def test_failed_sync_does_not_retry_inside_the_floor() -> None:
    from weft_sdk.facilitator.asgi import FACILITATOR_SYNC_RETRY_FLOOR_S

    assert FACILITATOR_SYNC_RETRY_FLOOR_S == 30
    state = FacilitatorState()
    state.supported_status = 500
    server, url = _facilitator(state)
    app = _middleware(url)
    try:
        await _http(app, "GET", "/v1/search")
        await _http(app, "GET", "/v1/search")
        assert len(_calls(state, "/supported")) == 1
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.asyncio
async def test_malformed_key_is_not_sent_or_logged(capsys: pytest.CaptureFixture[str]) -> None:
    secret = "wk live secret"
    state = FacilitatorState()
    server, url = _facilitator(state)
    app = _middleware(url, api_key=secret)
    try:
        status, _, _ = await _http(app, "GET", "/v1/search", {"x-model": "gpt"})
        assert status == 402
        for call in state.snapshot():
            blob = json.dumps(call["headers"])
            assert "Authorization" not in call["headers"]
            assert "X-API-Key" not in call["headers"]
            assert secret not in blob
            assert secret not in call["body"].decode("utf-8", errors="replace")
    finally:
        server.shutdown()
        server.server_close()
    captured = capsys.readouterr()
    assert captured.err.count("ignoring apiKey") == 1
    assert secret not in captured.err
    assert secret not in captured.out


@pytest.mark.asyncio
async def test_resume_before_handler_settlement_does_not_settle_again() -> None:
    state = FacilitatorState()
    server, url = _facilitator(state)
    calls: list[str] = []

    def resume(_context: Any, candidate: dict[str, Any]) -> dict[str, Any]:
        return {
            "paymentPayload": candidate["paymentPayload"],
            "paymentRequirements": candidate["paymentRequirements"],
            "beforeHandlerSettlement": {
                "flow": "upfront",
                "result": {
                    "success": True,
                    "transaction": "0xoriginal",
                    "network": NETWORK,
                    "payer": "0xpayer",
                },
            },
        }

    app = _middleware(url, calls=calls, resume=resume)
    try:
        unpaid, unpaid_headers, _ = await _http(app, "GET", "/v1/search", {"x-model": "gpt"})
        assert unpaid == 402
        challenge = decode_payment_required_header(unpaid_headers["payment-required"])
        before = len(_calls(state, "/settle"))
        status, headers, body = await _http(
            app,
            "POST",
            "/v1/search",
            {
                "x-model": "gpt",
                "payment-signature": _payment_header(challenge),
            },
        )
        assert status == 200
        assert body == b'{"ok":true}'
        assert calls == ["POST"]
        assert len(_calls(state, "/settle")) == before
        receipt = decode_payment_response_header(headers["payment-response"])
        assert receipt.transaction == "0xoriginal"
        assert receipt.success is True
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.asyncio
async def test_settle_connection_failure_is_facilitator_unavailable() -> None:
    state = FacilitatorState()
    state.settle_mode = "drop"
    server, url = _facilitator(state)
    app = _middleware(url)
    try:
        unpaid, unpaid_headers, _ = await _http(app, "GET", "/v1/search", {"x-model": "gpt"})
        assert unpaid == 402
        challenge = decode_payment_required_header(unpaid_headers["payment-required"])
        status, headers, body = await _http(
            app,
            "POST",
            "/v1/search",
            {
                "x-model": "gpt",
                "payment-signature": _payment_header(challenge),
            },
        )
        assert status == 503
        assert json.loads(body) == {"error": "facilitator_unavailable"}
        assert headers["retry-after"] == "1"
        assert "payment-response" not in headers
    finally:
        server.shutdown()
        server.server_close()
