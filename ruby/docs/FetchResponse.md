# Weft::FetchResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **status** | **Integer** | HTTP status returned by the upstream after the paid replay. |  |
| **headers** | **Hash&lt;String, String&gt;** | Response headers from the upstream. |  |
| **body_base64** | **String** | Base64-encoded response body. Empty string for empty bodies. |  |
| **paid_usd** | **String** | USD amount actually settled on-chain. \&quot;0.00\&quot; for any charge that hasn&#39;t (yet, or ever) settled — a signed hold is not yet spend. See &#x60;held_usd&#x60; for the nominal amount in that case. Exact to the micro-dollar, minimum two decimals; parse as a decimal rather than string-comparing against a bare zero literal.  |  |
| **held_usd** | **String** | The nominal charge amount when &#x60;paid_usd&#x60; is \&quot;0.00\&quot; — a hold awaiting settlement, or a charge that failed/expired without ever settling. &#x60;null&#x60; once &#x60;paid_usd&#x60; reflects the real settlement. Same format as &#x60;paid_usd&#x60;: exact to the micro-dollar, minimum two decimals.  |  |
| **payment_status** | **String** | Agent-facing settlement status. &#x60;pending&#x60; &#x3D; signed, no refusal signal yet (settlement may still land, e.g. x402&#39;s async facilitator webhook). &#x60;declined-pending&#x60; &#x3D; the merchant refused but the authorization isn&#39;t provably dead yet. &#x60;declined&#x60; / &#x60;expired&#x60; / &#x60;reverted&#x60; are terminal — the money never moved (or, for &#x60;reverted&#x60;, moved and then reversed on-chain) and never will for this charge.  |  |
| **tx_hash** | **String** | Settlement transaction hash. Null until a settlement hash has been reported. |  |
| **protocol** | **String** | Payment protocol selected for this fetch. |  |
| **artifact_id** | **Integer** | Internal artifact identifier if the response was persisted; &#x60;null&#x60; otherwise. |  |

## Example

```ruby
require 'weft-sdk'

instance = Weft::FetchResponse.new(
  status: 200,
  headers: null,
  body_base64: null,
  paid_usd: 0.002,
  held_usd: 0.002,
  payment_status: pending,
  tx_hash: null,
  protocol: null,
  artifact_id: null
)
```
