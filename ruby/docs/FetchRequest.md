# Weft::FetchRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **url** | **String** | Target URL. Must pass Weft&#39;s URL safety check (no SSRF / private IP ranges). |  |
| **max_cost_usd** | **String** | Merchant-principal ceiling, excluding gas, provider fees and prerequisites. Defaults to &#x60;0.10&#x60; USD; use &#x60;max_total_cost_usd&#x60; for an all-in bound. | [optional][default to &#39;0.10&#39;] |
| **allow_tempo_refill** | **Boolean** | Whether this request may create, adopt, or enqueue a Base-to-Tempo refill. Only JSON booleans are accepted. Omission allows legacy refill behavior unless &#x60;max_total_cost_usd&#x60; is supplied, in which case refill is disabled. False leaves unrelated bridges and jobs unchanged and reports an unfunded Tempo pocket as &#x60;INSUFFICIENT_BALANCE&#x60;. This does not select a rail or bound fees.  | [optional] |
| **max_total_cost_usd** | **String** | Optional all-in buyer-debit ceiling in USD, including principal, gas, provider fees and prerequisite operations. Requires a binding upstream upper bound before any payment effect. Current integrations have no such guarantee, so requests requiring wallet signing or payment fail closed with &#x60;TOTAL_COST_UNVERIFIABLE&#x60;, including recovery and replay of previous payments. No positive paid route is currently admitted in this mode. Estimates, expected sponsorship and receipts are not authority. Implies no refill; explicit &#x60;allow_tempo_refill: true&#x60; is invalid. Omission preserves legacy behavior.  | [optional] |
| **method** | **String** | HTTP method to use against the upstream. | [optional][default to &#39;GET&#39;] |
| **body** | [**FetchRequestBody**](FetchRequestBody.md) |  | [optional] |
| **headers** | **Hash&lt;String, String&gt;** | Headers forwarded to the upstream. Up to 32 headers, 4 KB total. The following are silently stripped: &#x60;host&#x60;, &#x60;authorization&#x60;, &#x60;cookie&#x60;, &#x60;proxy-authorization&#x60;, &#x60;x-forwarded-*&#x60;, &#x60;x-real-ip&#x60;, &#x60;x-payment&#x60;, &#x60;connection&#x60;, &#x60;upgrade&#x60;.  | [optional] |
| **search_id** | **String** | The &#x60;query_trace_id&#x60; from the &#x60;POST /api/v1/search&#x60; response that surfaced this URL. Optional and advisory: it attributes the purchase to the search that found it, and is used only for measurement.  It never affects payment, authorization, idempotency, or the response body — the buyer is always resolved from the credential, never from this field. A value that is not a well-formed handle is ignored rather than rejected, so an analytics mistake can never cost a fetch.  | [optional] |
| **operation_id** | **String** | Advisory operation id returned by search. | [optional] |
| **access_method_id** | **String** | Advisory access-method id returned by search; does not enforce a payment rail. | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::FetchRequest.new(
  url: https://x402.api.agentmail.to/v0/inboxes,
  max_cost_usd: 0.05,
  allow_tempo_refill: false,
  max_total_cost_usd: 0.05,
  method: null,
  body: null,
  headers: {Accept&#x3D;application/json, User-Agent&#x3D;my-agent/1.0},
  search_id: 11111111-1111-4111-8111-111111111111,
  operation_id: null,
  access_method_id: null
)
```
