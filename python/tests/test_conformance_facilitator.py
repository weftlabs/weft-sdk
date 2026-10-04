"""Run every facilitator conformance case. TypeScript is the reference."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from x402.http import x402HTTPResourceServer
from x402.http.types import HTTPRequestContext
from x402.server import x402ResourceServer

from weft_sdk.facilitator.client import (
    X402_FACILITATOR_URL_ENV,
    resolve_url,
    validate_url,
)
from weft_sdk.facilitator.extensions import dynamic_extension
from weft_sdk.facilitator.handshake import (
    WEFT_DECLARED_HEADER,
    build_facilitator_auth_headers,
    sdk_version,
)
from weft_sdk.facilitator.product import apply_product_identity
from weft_sdk.facilitator.settlement import is_facilitator_unavailable

ROOT = Path(__file__).resolve().parents[2] / "conformance" / "facilitator"
ADAPTER = "asgi"
SDK_VERSION = sdk_version()


def _load_cases() -> list[tuple[str, dict[str, Any]]]:
    loaded: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(ROOT.glob("*.json")):
        parsed = json.loads(path.read_text())
        if not isinstance(parsed, list):
            raise AssertionError(f"{path.name} must be an array of cases")
        for item in parsed:
            loaded.append((path.name, item))
    return loaded


CASES = _load_cases()


def _selected(languages: list[str] | None) -> bool:
    return languages is None or "python" in languages


def _substitute(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace("$ADAPTER", ADAPTER).replace("$SDK_VERSION", SDK_VERSION)
    if isinstance(value, list):
        return [_substitute(item) for item in value]
    if isinstance(value, dict):
        return {key: _substitute(item) for key, item in value.items()}
    return value


def _classify_product(message: str) -> str:
    text = message.removeprefix("[weft] ")
    if "route serviceName" in text or "product name" in text or text.startswith("ignoring name"):
        return "name"
    if "route type" in text or text.startswith("ignoring type"):
        return "type"
    if "tag" in text:
        return "tags"
    if "iconUrl" in text:
        return "iconUrl"
    if "productId" in text:
        return "productId"
    if "manifestHash" in text:
        return "manifestHash"
    if "dimension" in text:
        return "dimensions"
    if "route extensions" in text:
        return "extensions"
    if text.startswith("ignoring route"):
        return "route"
    raise AssertionError(f"unclassified product warning: {text}")


def _classify_extension(message: str) -> str:
    text = message.removeprefix("[weft] ")
    start = text.find("extensions[")
    if start < 0:
        raise AssertionError(f"unclassified extension warning: {text}")
    key = text[start + len("extensions[") : text.find("]", start)]
    if "over the" in text:
        return f"{key}:over-cap"
    if "JSON cannot carry" in text:
        return f"{key}:unserializable"
    if "callback failed" in text:
        return f"{key}:threw"
    if "no HTTP request" in text:
        return f"{key}:no-request"
    if "returned" in text:
        return f"{key}:not-an-object"
    raise AssertionError(f"unclassified extension warning: {text}")


def _canonical_declared(payload: dict[str, Any]) -> str:
    ordered = {
        key: payload[key]
        for key in ("name", "type", "tags", "icon_url", "dimensions")
        if key in payload
    }
    return json.dumps(ordered, separators=(",", ":"), ensure_ascii=False)


def _encode_declared(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_declared(value: str) -> Any:
    padded = value.replace("-", "+").replace("_", "/")
    padded += "=" * ((4 - len(padded) % 4) % 4)
    return json.loads(base64.b64decode(padded))


def _materialize(value: Any) -> Any:
    if isinstance(value, dict) and list(value) == ["$fixture"]:
        kind = str(value["$fixture"])
        if kind == "circular":
            circular: dict[str, Any] = {}
            circular["self"] = circular
            return circular
        if kind == "nan-field":
            return {"n": float("nan")}
        raise AssertionError(f"unknown fixture value {kind}")
    return value


def test_loads_every_facilitator_fixture() -> None:
    assert CASES
    assert {name for name, _ in CASES} == {
        "auth-headers.json",
        "declared-header.json",
        "facilitator-url.json",
        "product-identity.json",
        "request-extension.json",
        "route-match.json",
        "settlement.json",
    }


@pytest.mark.parametrize(
    ("filename", "case"), CASES, ids=[f"{name}: {item['name']}" for name, item in CASES]
)
def test_facilitator_case(
    filename: str, case: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    if not _selected(case.get("languages")):
        pytest.skip(case.get("reason", "languages list excludes python"))
    if filename == "auth-headers.json":
        _assert_auth_headers(case, monkeypatch)
        return
    if filename == "declared-header.json":
        _assert_declared_header(case, monkeypatch)
        return
    if filename == "product-identity.json":
        _assert_product_identity(case, monkeypatch)
        return
    if filename == "request-extension.json":
        _assert_request_extension(case)
        return
    if filename == "facilitator-url.json":
        _assert_facilitator_url(case, monkeypatch)
        return
    if filename == "settlement.json":
        reason = case["reason"]
        assert is_facilitator_unavailable(None if reason is None else str(reason)) is case["expect"]
        return
    if filename == "route-match.json":
        assert _route_matches(case) is case["match"]
        return
    raise AssertionError(f"no facilitator runner for {filename}")


def _capture(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    warnings: list[str] = []

    def record(message: str) -> None:
        warnings.append(message)

    monkeypatch.setattr("weft_sdk.facilitator.warn.console_warn", record)
    monkeypatch.setattr("weft_sdk.facilitator.handshake.console_warn", record)
    return warnings


def _route_matches(case: dict[str, Any]) -> bool:
    pattern = str(case["pattern"])
    method = str(case["method"])
    path = str(case["path"])
    server = x402HTTPResourceServer(
        x402ResourceServer(None),
        {pattern: {"accepts": []}},
    )
    context = HTTPRequestContext(adapter=SimpleNamespace(), path=path, method=method)
    return server.requires_payment(context)


def _assert_auth_headers(case: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    args = _substitute(case["args"])
    expected = _substitute(case["expect"])
    warnings = _capture(monkeypatch)
    headers = build_facilitator_auth_headers(
        args["adapter"],
        args["apiKey"] if "apiKey" in args else None,
        args["declaration"],
    )
    supported = dict(expected["supported"])
    if expected["declared"]:
        supported[WEFT_DECLARED_HEADER] = headers["supported"][WEFT_DECLARED_HEADER]
        assert isinstance(headers["supported"][WEFT_DECLARED_HEADER], str)
        assert headers["supported"][WEFT_DECLARED_HEADER]
    else:
        assert WEFT_DECLARED_HEADER not in headers["supported"]
    assert headers["supported"] == supported
    assert headers.get("settle") == expected["settle"] or (
        expected["settle"] is None and "settle" not in headers
    )
    assert headers.get("verify") == expected["verify"] or (
        expected["verify"] is None and "verify" not in headers
    )
    present = ["supported"]
    if expected["settle"] is not None:
        present.append("settle")
    if expected["verify"] is not None:
        present.append("verify")
    assert sorted(headers) == sorted(present)
    assert len(warnings) == expected["warnings"]
    for secret in expected.get("absentFromLogs") or []:
        assert all(secret not in line for line in warnings)


def _assert_declared_header(case: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    expected = case["expect"]
    warnings = _capture(monkeypatch)
    headers = build_facilitator_auth_headers("asgi", None, case["declaration"])
    encoded = headers["supported"].get(WEFT_DECLARED_HEADER)
    if not expected["present"]:
        assert encoded is None
    else:
        assert isinstance(encoded, str)
        assert not any(char in encoded for char in "+/=")
        assert _decode_declared(encoded) == expected["json"]
        assert encoded == _encode_declared(_canonical_declared(expected["json"]))
    assert sorted(_classify_product(line) for line in warnings) == sorted(expected["warningKeys"])


def _assert_product_identity(case: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    expected = case["expect"]
    warnings = _capture(monkeypatch)
    result = apply_product_identity(case["routes"], case["declaration"])
    if expected.get("unchanged"):
        assert result is case["routes"]
    else:
        assert result == (expected.get("route") if "route" in expected else expected["routes"])
    assert sorted({_classify_product(line) for line in warnings}) == sorted(expected["rejected"])


def _assert_request_extension(case: dict[str, Any]) -> None:
    key = str(case["key"])
    expected = case["expect"]
    extensions = {**case["extensions"], key: lambda _request: _materialize(case["resolved"])}

    async def callback(_request: object) -> Any:
        return _materialize(case["resolved"])

    extensions[key] = callback
    context = SimpleNamespace(
        payment_required_response=SimpleNamespace(extensions=extensions),
        transport_context=SimpleNamespace(request={}),
    )
    warnings: list[str] = []

    def warn(message: str, dedupe_key: str | None = None) -> None:
        del dedupe_key
        warnings.append(f"[weft] {message}")

    hook = dynamic_extension(key, warn)
    shipped = _run(hook.enrich_payment_required_response(extensions[key], context))
    if expected["dropped"]:
        assert shipped is None
        assert key not in extensions
        if "remaining" in expected:
            assert extensions == expected["remaining"]
    else:
        assert shipped == expected["shipped"]
    assert sorted(_classify_extension(line) for line in warnings) == sorted(expected["warningKeys"])


def _assert_facilitator_url(case: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    args = case["args"]
    env = args.get("env") or {}
    if X402_FACILITATOR_URL_ENV in env:
        monkeypatch.setenv(X402_FACILITATOR_URL_ENV, env[X402_FACILITATOR_URL_ENV])
    else:
        monkeypatch.delenv(X402_FACILITATOR_URL_ENV, raising=False)
    if case["fn"] == "resolveUrl":
        assert resolve_url(args.get("config")) == case["expect"]
        return
    if case["fn"] == "validateUrl":
        if case["expectError"] is True:
            with pytest.raises(ValueError):
                validate_url(args.get("url") or "")
        else:
            validate_url(args.get("url") or "")
        return
    raise AssertionError(f"unknown facilitator url function {case['fn']}")


def _run(awaitable: Any) -> Any:
    import asyncio

    return asyncio.run(awaitable)
