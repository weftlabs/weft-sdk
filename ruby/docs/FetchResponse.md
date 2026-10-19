# Weft::FetchResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **status** | **Integer** | HTTP status returned by the upstream after the payment or SIWX authentication retry. |  |
| **headers** | **Hash&lt;String, String&gt;** | Response headers from the upstream. |  |
| **body_base64** | **String** | Base64-encoded response body. Empty string for empty bodies. |  |
| **paid_usd** | **String** | USD amount actually settled on-chain. \&quot;0.00\&quot; for any charge that hasn&#39;t (yet, or ever) settled — a signed hold is not yet spend. See &#x60;held_usd&#x60; for the nominal amount in that case. Exact to the micro-dollar, minimum two decimals; parse as a decimal rather than string-comparing against a bare zero literal.  |  |
| **held_usd** | **String** | The nominal charge amount when &#x60;paid_usd&#x60; is \&quot;0.00\&quot; — a hold awaiting settlement, or a charge that failed/expired without ever settling. &#x60;null&#x60; once &#x60;paid_usd&#x60; reflects the real settlement. Same format as &#x60;paid_usd&#x60;: exact to the micro-dollar, minimum two decimals.  |  |
| **payment_status** | **String** | Agent-facing settlement status. &#x60;not_required&#x60; means SIWX wallet authentication returned the response without payment. &#x60;pending&#x60; &#x3D; signed, no refusal signal yet (settlement may still land, e.g. x402&#39;s async facilitator webhook). &#x60;declined-pending&#x60; &#x3D; the merchant refused but the authorization isn&#39;t provably dead yet. &#x60;declined&#x60; / &#x60;expired&#x60; / &#x60;reverted&#x60; are terminal — the money never moved (or, for &#x60;reverted&#x60;, moved and then reversed on-chain) and never will for this charge.  |  |
| **tx_hash** | **String** | Settlement transaction hash. Null until a settlement hash has been reported. |  |
| **protocol** | **String** | Payment protocol selected for this fetch. |  |
| **artifact_id** | **Integer** | Internal artifact identifier if the response was persisted; &#x60;null&#x60; otherwise. |  |
| **purchase_id** | **String** | The buyer purchase that paid for this fetch: an opaque id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts and that purchase rows carry as &#x60;purchase_id&#x60;. It is not the sequential &#x60;Purchase.id&#x60;; do not parse or order by it. That purchase reports its own &#x60;status&#x60;, not &#x60;payment_status&#x60;: &#x60;signed&#x60; while the payment is pending, then &#x60;settled&#x60; (charged its &#x60;amount_usd&#x60;, which can be less than &#x60;held_usd&#x60;) or &#x60;declined&#x60;, &#x60;locked&#x60;, &#x60;expired&#x60;, or &#x60;reverted&#x60; (not charged). A &#x60;settled&#x60; purchase with &#x60;failure_reason: merchant_delivery_failed&#x60; was charged, but no successful paid response was delivered. An idempotent replay returns the same id, so bill at most once for each id. &#x60;null&#x60; when no payment was made (&#x60;payment_status: not_required&#x60;).  The lookup needs purchase-history access: a &#x60;wk_*&#x60; key, a claimed &#x60;wbt_*&#x60; bearer, or a REST OAuth token with the &#x60;balance&#x60; scope. An OAuth token issued for the MCP server cannot call this endpoint. Current servers always send this field. It is optional in this schema so that a client also accepts a response from an older server.  | [optional] |

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
  artifact_id: null,
  purchase_id: pur_4V3n9mQ0b7XyK2sLpR8tWc1d
)
```
