import pytest

from weft_sdk.facilitator.client import reset_shared_supported
from weft_sdk.facilitator.handshake import reset_middleware_constructions


@pytest.fixture(autouse=True)
def _fresh_process_state():
    """The handshake is shared per process; each test needs a fresh process."""
    reset_shared_supported()
    reset_middleware_constructions()
