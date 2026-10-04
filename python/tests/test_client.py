"""Tests for facilitator client."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from x402.schemas import PaymentPayload, PaymentRequirements

from weft_sdk.facilitator.client import (
    X402_FACILITATOR_URL,
    X402_FACILITATOR_URL_ENV,
    FacilitatorClient,
    FacilitatorUnavailableError,
    create_facilitator_client,
    resolve_url,
    validate_url,
)


class TestValidateUrl:
    def test_accepts_https_url(self):
        validate_url("https://x402.weft.network")

    def test_accepts_http_url(self):
        validate_url("http://localhost:7676")

    def test_rejects_empty_string(self):
        with pytest.raises(ValueError, match="URL cannot be empty"):
            validate_url("")

    def test_rejects_whitespace_only(self):
        with pytest.raises(ValueError, match="URL cannot be empty"):
            validate_url("   ")

    def test_rejects_url_without_protocol(self):
        with pytest.raises(ValueError, match="URL must start with http://"):
            validate_url("x402.weft.network")

    def test_rejects_ftp_protocol(self):
        with pytest.raises(ValueError, match="URL must start with http://"):
            validate_url("ftp://x402.weft.network")


class TestResolveUrl:
    def test_returns_config_url_when_provided(self):
        assert resolve_url({"url": "https://custom.example.com"}) == "https://custom.example.com"

    def test_returns_env_var_url_when_no_config(self, monkeypatch):
        monkeypatch.setenv(X402_FACILITATOR_URL_ENV, "https://env.example.com")
        assert resolve_url() == "https://env.example.com"

    def test_prefers_config_over_env(self, monkeypatch):
        monkeypatch.setenv(X402_FACILITATOR_URL_ENV, "https://env.example.com")
        assert resolve_url({"url": "https://config.example.com"}) == "https://config.example.com"

    def test_returns_default_when_no_config_no_env(self, monkeypatch):
        monkeypatch.delenv(X402_FACILITATOR_URL_ENV, raising=False)
        assert resolve_url() == X402_FACILITATOR_URL

    def test_returns_default_when_config_has_no_url(self, monkeypatch):
        monkeypatch.delenv(X402_FACILITATOR_URL_ENV, raising=False)
        assert resolve_url({}) == X402_FACILITATOR_URL


class TestCreateFacilitatorClient:
    def test_creates_client_with_default_url(self, monkeypatch):
        monkeypatch.delenv(X402_FACILITATOR_URL_ENV, raising=False)
        client = create_facilitator_client()
        assert isinstance(client, FacilitatorClient)

    def test_creates_client_with_custom_url(self):
        client = create_facilitator_client({"url": "https://custom.example.com"})
        assert isinstance(client, FacilitatorClient)

    def test_raises_on_invalid_url(self):
        with pytest.raises(ValueError, match="URL must start with http://"):
            create_facilitator_client({"url": "not-a-url"})

    def test_async_create_auth_headers_rejected_at_construction(self):
        async def headers() -> dict[str, dict[str, str]]:
            return {}

        with pytest.raises(TypeError, match="must be synchronous"):
            create_facilitator_client(
                {"url": "https://x402.weft.network", "create_auth_headers": headers}
            )


def _requirements() -> PaymentRequirements:
    return PaymentRequirements(
        scheme="exact",
        network="eip155:84532",
        asset="0xasset",
        amount="1",
        pay_to="0xpay",
        max_timeout_seconds=60,
    )


def _payload() -> PaymentPayload:
    return PaymentPayload(x402_version=2, payload={"sig": "abc"}, accepted=_requirements())


class _Recorder:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []


def _server(recorder: _Recorder, settle_status: int = 200) -> tuple[ThreadingHTTPServer, str]:
    class Handler(BaseHTTPRequestHandler):
        def _body(self) -> bytes:
            length = int(self.headers.get("Content-Length", "0"))
            return self.rfile.read(length) if length else b""

        def _store(self, body: bytes) -> None:
            recorder.calls.append(
                {
                    "path": self.path,
                    "headers": {key: value for key, value in self.headers.items()},
                    "body": json.loads(body.decode()) if body else None,
                }
            )

        def _send(self, status: int, payload: dict[str, object]) -> None:
            raw = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:  # noqa: N802
            self._store(b"")
            self._send(
                200,
                {"kinds": [{"x402Version": 2, "scheme": "exact", "network": "eip155:84532"}]},
            )

        def do_POST(self) -> None:  # noqa: N802
            body = self._body()
            self._store(body)
            if self.path.endswith("/verify"):
                self._send(200, {"isValid": True, "payer": "0xpayer"})
                return
            if settle_status == 503:
                self._send(
                    503,
                    {
                        "success": False,
                        "errorReason": "temporarily_unavailable",
                        "transaction": "",
                        "network": "eip155:84532",
                    },
                )
                return
            self._send(
                200,
                {
                    "success": True,
                    "transaction": "0xabc",
                    "network": "eip155:84532",
                    "payer": "0xpayer",
                },
            )

        def log_message(self, fmt: str, *args: object) -> None:
            del fmt, args

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


class TestFacilitatorClient:
    @pytest.mark.asyncio
    async def test_verify_and_settle_send_the_v2_body(self):
        recorder = _Recorder()
        server, url = _server(recorder)
        try:
            client = create_facilitator_client(
                {
                    "url": url,
                    "create_headers": lambda: {
                        "verify": {"X-API-Key": "seller-key"},
                        "settle": {"x-api-key": "seller-key"},
                    },
                },
                {"settle": {"X-API-Key": "derived"}, "verify": {"X-API-Key": "derived"}},
            )
            verified = await client.verify(_payload(), _requirements())
            settled = await client.settle(_payload(), _requirements())
            supported = client.get_supported()
        finally:
            server.shutdown()
            server.server_close()

        assert verified.is_valid is True
        assert settled.success is True
        assert settled.transaction == "0xabc"
        assert supported.kinds
        verify = next(call for call in recorder.calls if str(call["path"]).endswith("/verify"))
        settle = next(call for call in recorder.calls if str(call["path"]).endswith("/settle"))
        assert verify["body"]["x402Version"] == 2
        assert verify["body"]["paymentPayload"]["payload"] == {"sig": "abc"}
        assert verify["body"]["paymentRequirements"]["amount"] == "1"
        assert verify["headers"]["X-API-Key"] == "seller-key"
        assert settle["headers"]["x-api-key"] == "seller-key"
        assert "X-API-Key" not in settle["headers"]

    @pytest.mark.asyncio
    async def test_structured_503_is_facilitator_unavailable(self):
        recorder = _Recorder()
        server, url = _server(recorder, settle_status=503)
        try:
            client = FacilitatorClient(url)
            with pytest.raises(
                FacilitatorUnavailableError, match="weft:facilitator-settle-unavailable"
            ):
                await client.settle(_payload(), _requirements())
        finally:
            server.shutdown()
            server.server_close()
