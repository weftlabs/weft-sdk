# Weft::FetchApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
| ------ | ------------ | ----------- |
| [**fetch**](FetchApi.md#fetch) | **POST** /api/v1/fetch | Pay-and-fetch any URL (x402/MPP proxy) |


## fetch

> <FetchResponse> fetch(fetch_request, opts)

Pay-and-fetch any URL (x402/MPP proxy)

Universal x402/MPP fetch proxy. The caller provides a target `url`, a merchant-principal `max_cost_usd` ceiling, and optional `method` / `body` / `headers`. Weft:    1. Issues the request.   2. On `402 Payment Required`, selects a supported x402 or MPP challenge.   3. Compares the asking price to `max_cost_usd` and the      buyer's policy (`max_tx_usd`, daily/weekly limits).   4. If refill is allowed and an eligible mainnet MPP challenge finds its Tempo token short,      creates or adopts a buyer-owned Base-to-Tempo refill and returns      `409 FUNDING_PENDING` with `details.reason=funding_active`. If an      overlapping payment invalidates the balance observation before a      bridge is created, the same retryable response carries      `details.reason=balance_changed`. The caller retries the identical      fetch after `details.retry_after_seconds`; that later request      obtains a fresh challenge and reruns rail selection and all payment      controls.   5. Authorizes payment from the buyer's wallet on the selected rail.   6. Replays the request with the protocol-specific payment credential.   7. Streams the upstream artifact back, base64-encoded under       `body_base64`, with `paid_usd`, `held_usd`, `payment_status`,       `tx_hash`, and `protocol`. `paid_usd`      is \"0.00\" until the charge is CONFIRMED settled — a signed-but-      unsettled hold (the common case for x402, which settles      asynchronously) reports its amount in `held_usd` instead, never      in `paid_usd`.  **Opt-in safety controls:** `allow_tempo_refill: false` prevents this request from creating, adopting, or enqueueing a Base-to-Tempo bridge. A Tempo shortfall returns `402 INSUFFICIENT_BALANCE`; unrelated bridges and their jobs remain unchanged. `access_method_id` is advisory and does not enforce a payment rail.  `max_total_cost_usd` is an all-in ceiling covering merchant principal, network gas, provider fees, and prerequisite buyer-paid operations. It disables refill; explicitly combining it with `allow_tempo_refill: true` returns `422 INCOMPATIBLE_FETCH_CONTROLS`. Current wallet integrations provide no supported binding all-in fee guarantee. Therefore all-in requests return `402 TOTAL_COST_UNVERIFIABLE` before payment preparation, approval, reservation, or refill. This also refuses recovery of older payments and SIWX wallet signing; it admits no positive paid route. Increasing the ceiling does not resolve missing fee authority.  Omitted controls preserve existing behavior. Ordinary non-402 merchant responses retain `MERCHANT_RETURNED_NON_402`. Stored-result replay is historical payment information, not a new bounded authorization.  Errors are structured with a stable `error` code, and each error response carries the buyer's `policy`, `balance`, and a `dashboard_url` so a CLI can render an actionable message without a second round-trip.  Account-scoped: the bearer must be a buyer-scoped API key, an OAuth access token carrying `fetch`, or a claimed `wbt_*` bearer.  **Forwarded headers:** the caller's `headers` are passed through to the upstream, except a denylist of hop-by-hop and Weft-internal headers (`host`, `authorization`, `cookie`, `proxy-authorization`, `x-forwarded-*`, `x-real-ip`, `x-payment`, `connection`, `upgrade`). Up to 32 headers, 4 KB of combined value bytes.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::FetchApi.new
fetch_request = Weft::FetchRequest.new({url: 'https://x402.api.agentmail.to/v0/inboxes'}) # FetchRequest |
opts = {
  idempotency_key: 'idempotency_key_example' # String | Opaque caller-generated retry key. Reusing the same key for the same buyer converges on one paid fetch; keys are hashed and namespaced by buyer before storage. Send this header for every unattended or retryable paid request. Effective safety controls participate in retry identity. Changing them under a reserved key returns `IDEMPOTENCY_CONFLICT`; an older unconstrained payment cannot become a bounded success on retry.
}

begin
  # Pay-and-fetch any URL (x402/MPP proxy)
  result = api_instance.fetch(fetch_request, opts)
  p result
rescue Weft::ApiError => e
  puts "Error when calling FetchApi->fetch: #{e}"
end
```

#### Using the fetch_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<FetchResponse>, Integer, Hash)> fetch_with_http_info(fetch_request, opts)

```ruby
begin
  # Pay-and-fetch any URL (x402/MPP proxy)
  data, status_code, headers = api_instance.fetch_with_http_info(fetch_request, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <FetchResponse>
rescue Weft::ApiError => e
  puts "Error when calling FetchApi->fetch_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **fetch_request** | [**FetchRequest**](FetchRequest.md) |  |  |
| **idempotency_key** | **String** | Opaque caller-generated retry key. Reusing the same key for the same buyer converges on one paid fetch; keys are hashed and namespaced by buyer before storage. Send this header for every unattended or retryable paid request. Effective safety controls participate in retry identity. Changing them under a reserved key returns &#x60;IDEMPOTENCY_CONFLICT&#x60;; an older unconstrained payment cannot become a bounded success on retry.  | [optional] |

### Return type

[**FetchResponse**](FetchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json
