"""Run shared buyer-façade conformance cases against the Python client."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit
from uuid import UUID

import pytest
from urllib3 import HTTPResponse
from urllib3.exceptions import ProtocolError

from weft_sdk import Client, WeftError

ROOT = Path(__file__).resolve().parents[2] / "conformance" / "client"
CLIENT_FIELDS = {
    "credential": "api_key",
    "accessToken": "access_token",
    "baseUrl": "base_url",
}
SEARCH_FIELDS = {
    "query": "query",
    "maxResults": "max_results",
    "filters": "filters",
}
FILTER_FIELDS = {
    "price": "price",
    "priceAtomic": "price_atomic",
    "type": "type",
    "protocol": "protocol",
    "category": "category",
    "method": "method",
    "executionMode": "execution_mode",
    "weftFetchCompatible": "weft_fetch_compatible",
    "includeUnknownPrices": "include_unknown_prices",
}
OPERATOR_FIELDS = {
    "lte": "lte",
    "gte": "gte",
    "eq": "eq",
    "in": "in",
    "rangeGte": "range_gte",
    "rangeLte": "range_lte",
}
NESTED_FILTERS = {
    "price",
    "price_atomic",
    "type",
    "protocol",
    "category",
    "method",
    "execution_mode",
}
FETCH_REQUEST_FIELDS = {
    "url": "url",
    "maxCostUsd": "max_cost_usd",
    "method": "method",
    "body": "body",
    "headers": "headers",
    "searchId": "search_id",
    "operationId": "operation_id",
    "accessMethodId": "access_method_id",
}
FETCH_OPTION_FIELDS = {"idempotencyKey": "idempotency_key"}
PURCHASE_LIST_FIELDS = {"page": "page", "perPage": "per_page"}


def _cases() -> list[tuple[str, dict[str, Any]]]:
    loaded: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(ROOT.glob("*.json")):
        payload = json.loads(path.read_text())
        if not isinstance(payload, list):
            raise AssertionError(f"{path.name} must be an array of cases")
        for item in payload:
            loaded.append((path.name, item))
    if not loaded:
        raise AssertionError("no client conformance cases found")
    return loaded


CASES = _cases()


def _case_id(pair: tuple[str, dict[str, Any]]) -> str:
    filename, case = pair
    return f"{filename}::{case['name']}"


def _map_fields(source: dict[str, Any], table: dict[str, str]) -> dict[str, Any]:
    unknown = sorted(set(source) - set(table))
    if unknown:
        raise AssertionError(f"unmapped call fields: {unknown}")
    return {table[key]: source[key] for key in source}


def _map_filters(value: dict[str, Any]) -> dict[str, Any]:
    mapped = _map_fields(value, FILTER_FIELDS)
    for name in NESTED_FILTERS:
        nested = mapped.get(name)
        if isinstance(nested, dict):
            mapped[name] = _map_fields(nested, OPERATOR_FIELDS)
    return mapped


def _wire(model: Any) -> Any:
    return json.loads(json.dumps(model.to_dict(), default=_json_default))


def _json_default(value: object) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        utc = value.astimezone(timezone.utc)
        return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"cannot serialize {type(value).__name__}")


def _header_map(headers: Any) -> dict[str, str]:
    return {str(name).lower(): str(value) for name, value in headers.items()}


def _materialize(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"$fixture"}:
        kind = value["$fixture"]
        if kind == "non-finite-body":
            return {
                "n": float("nan"),
                "inf": float("inf"),
                "neg": float("-inf"),
                "nested": {"n": float("nan")},
                "items": [float("nan"), float("inf"), 1],
            }
        raise AssertionError(f"unknown fixture value {kind}")
    if isinstance(value, dict):
        return {key: _materialize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_materialize(item) for item in value]
    return value


def _python_json_body(case: dict[str, Any], expected: dict[str, Any]) -> Any:
    body = expected.get("jsonBody")
    if case["call"]["method"] != "fetch" or not isinstance(body, dict):
        return body
    request = (case["call"].get("args") or {}).get("request") or {}
    search_id = request.get("searchId")
    if not isinstance(search_id, str):
        return body
    try:
        UUID(search_id)
    except ValueError:
        # The fixture body is the TypeScript wire. Python omits a search id
        # that is not a UUID, because the generated model cannot carry it.
        adjusted = dict(body)
        adjusted.pop("search_id", None)
        return adjusted
    return body


def _invoke(client: Client, case: dict[str, Any]) -> Any:
    method = case["call"]["method"]
    args = case["call"].get("args") or {}
    if method == "me":
        return client.me()
    if method == "balance":
        return client.balance()
    if method == "search":
        request = _map_fields(args["request"], SEARCH_FIELDS)
        if "filters" in request:
            request["filters"] = _map_filters(request["filters"])
        return client.search(**request)
    if method == "fetch":
        request = _map_fields(_materialize(args["request"]), FETCH_REQUEST_FIELDS)
        options = _map_fields(args["options"], FETCH_OPTION_FIELDS)
        return client.fetch(**request, **options)
    if method == "purchases":
        return client.purchases(**_map_fields(args.get("options") or {}, PURCHASE_LIST_FIELDS))
    if method == "purchase":
        return client.purchase(args["id"])
    raise AssertionError(f"unknown call {method}")


@pytest.mark.parametrize("filename,case", CASES, ids=[_case_id(pair) for pair in CASES])
def test_client_conformance(filename: str, case: dict[str, Any]) -> None:
    del filename
    languages = case.get("languages")
    if languages is not None and "python" not in languages:
        pytest.skip(f"{case['name']} is not a Python case")

    calls: list[dict[str, Any]] = []

    def transport(
        method: str,
        url: str,
        body: bytes | None = None,
        headers: Any = None,
        **_: Any,
    ) -> HTTPResponse:
        calls.append({"method": method, "url": url, "body": body, "headers": headers or {}})
        response = case.get("response") or {}
        if response.get("networkFailure"):
            raise ProtocolError("connection reset")
        raw = response.get("body")
        payload = raw.encode() if isinstance(raw, str) else json.dumps(raw).encode()
        return HTTPResponse(
            body=payload,
            status=int(response.get("status", 200)),
            headers=response.get("headers") or {},
            reason=response.get("reason"),
            preload_content=False,
        )

    kwargs = _map_fields(case["client"], CLIENT_FIELDS)

    thrown: BaseException | None = None
    result: Any = None
    try:
        client = Client(**kwargs)
        client._api_client.rest_client.pool_manager.request = transport
        result = _invoke(client, case)
    except Exception as error:  # noqa: BLE001 - the case decides which failure is expected
        thrown = error

    if case.get("expectValidationError"):
        assert thrown is not None
        assert calls == []
        return

    if "expectError" in case:
        assert isinstance(thrown, WeftError)
        expected = case["expectError"]
        assert thrown.status == expected["status"]
        assert thrown.code == expected["code"]
        assert str(thrown) == expected["message"]
        assert thrown.request_id == expected["requestId"]
        assert thrown.retryable is expected["retryable"]
        if "details" in expected:
            assert thrown.details == expected["details"]
    else:
        assert thrown is None
        assert _wire(result) == case["expectResult"]

    expected_request = case.get("expectRequest")
    if expected_request is None:
        return
    assert len(calls) == 1
    recorded = calls[0]
    parsed = urlsplit(recorded["url"])
    base = (case["client"].get("baseUrl") or "https://weft.network").rstrip("/")
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == base + expected_request["path"]
    assert recorded["method"] == expected_request["method"]
    assert dict(parse_qsl(parsed.query)) == expected_request["query"]
    headers = _header_map(recorded["headers"])
    for name, value in expected_request["headers"].items():
        assert headers[name.lower()] == value
    if case["call"]["method"] != "fetch":
        assert "idempotency-key" not in headers
    if "jsonBody" in expected_request:
        assert json.loads(recorded["body"]) == _python_json_body(case, expected_request)
    else:
        assert recorded["body"] in (None, b"")
