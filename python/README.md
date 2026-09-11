# `weft-sdk` for Python

The supported Python buyer client for Weft. Generated OpenAPI APIs remain
available under `weft_sdk.generated` as an advanced escape hatch.

## Install and authenticate

Create a buyer `wk_*` key in
[Dashboard → API keys](https://weft.network/dashboard/buyer/api_keys), then:

```sh
pip install weft-sdk
export WEFT_API_KEY="wk_..."
```

## Search

```python
import os

from weft_sdk import Client

api_key = os.environ["WEFT_API_KEY"]
with Client(api_key=api_key) as weft:
    account = weft.me()
    results = weft.search(query="weather data API", max_results=5)

print(account.data)
print(results.results)
```

The client defaults to `https://weft.network`.

## Bounded paid fetch

Paid fetches require both a maximum cost and an idempotency key. Reuse the key
when retrying the same logical purchase after an uncertain response.

```python
from uuid import uuid4

idempotency_key = str(uuid4())
artifact = weft.fetch(
    url="https://merchant.example/data",
    max_cost_usd="0.05",
    idempotency_key=idempotency_key,
)
```

## Handle API errors

All buyer-client methods raise the same `WeftError` shape, including the HTTP
status, stable error code, request ID, retry hint, and structured details.

```python
from weft_sdk import WeftError

try:
    results = weft.search(query="weather data API")
except WeftError as error:
    print(error.status, error.code, error.request_id, error.retryable)
    print(error.details)
    raise
```

- `401`: confirm that `WEFT_API_KEY` contains a current buyer `wk_*` key.
- `403`: inspect `code` and `details` for an insufficient balance or spending
  policy denial before changing the request.
- `409` (`IDEMPOTENCY_CONFLICT`): this buyer already used the supplied
  idempotency key for a different fetch request. Generate a new key for the
  new operation; the original operation retries unchanged with its own key.
  `retryable` is `False` — resending the conflicting request will conflict
  again.
- `429`: honor `Retry-After` and back off.
- `5xx`: retry transient failures with backoff; reuse the idempotency key for a
  paid fetch.
- `status == 0` (`NETWORK_ERROR`): the request failed before any Weft
  response, so the outcome is uncertain. `retryable` is `True`; retry with
  backoff and reuse the idempotency key for a paid fetch.

See the [API reference](https://weft.network/docs) for the complete contract.
Product guides live on [weftlabs.com](https://weftlabs.com).
