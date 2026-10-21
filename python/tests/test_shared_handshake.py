"""A middleware built per request must not handshake per request."""

from __future__ import annotations

import time

import pytest
from test_facilitator_asgi import FacilitatorState, _facilitator, _middleware

from weft_sdk.facilitator import client as client_module
from weft_sdk.facilitator.fee import get_fee_info, invalidate_fee_cache
from weft_sdk.facilitator.handshake import CONSTRUCTION_WARN_THRESHOLD


def _supported_calls(state: FacilitatorState) -> list[dict]:
    return [c for c in state.snapshot() if c["path"].startswith("/supported")]


def _build(url: str, **kwargs):
    middleware = _middleware(url, **kwargs)
    assert middleware._boot_done.wait(5)
    return middleware


@pytest.fixture
def facilitator():
    state = FacilitatorState()
    server, url = _facilitator(state)
    yield state, url
    server.shutdown()


def test_many_constructions_make_one_supported_call(facilitator):
    state, url = facilitator
    for _ in range(5):
        _build(url)
    assert len(_supported_calls(state)) == 1


def test_different_api_key_is_a_different_handshake(facilitator):
    state, url = facilitator
    _build(url, api_key="wk_live_a")
    _build(url, api_key="wk_live_b")
    assert len(_supported_calls(state)) == 2


def test_failed_sync_is_held_to_the_floor_then_retries(facilitator, monkeypatch):
    state, url = facilitator
    state.supported_status = 503
    _build(url)
    _build(url)
    assert len(_supported_calls(state)) == 1
    real = time.monotonic
    monkeypatch.setattr(client_module.time, "monotonic", lambda: real() + 31.0)
    _build(url)
    assert len(_supported_calls(state)) == 2


def test_warns_once_when_constructed_many_times(facilitator, capsys):
    _, url = facilitator
    for _ in range(CONSTRUCTION_WARN_THRESHOLD + 5):
        _build(url)
    assert capsys.readouterr().err.count("constructed more than") == 1


async def test_fee_refresh_is_not_a_handshake(facilitator):
    state, url = facilitator
    invalidate_fee_cache()
    await get_fee_info(
        {
            "url": url,
            "create_auth_headers": lambda: {
                "supported": {"Authorization": "Bearer wk_live_a", "X-Weft-Declared": "abc"}
            },
        }
    )
    (call,) = _supported_calls(state)
    names = {k.lower() for k in call["headers"]}
    assert "authorization" not in names
    assert "x-weft-declared" not in names
    invalidate_fee_cache()
