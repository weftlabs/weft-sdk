# FetchResponse

Successful fetch envelope. `body_base64` is the upstream artifact bytes, base64-encoded. `paid_usd`, `held_usd`, `payment_status`, `tx_hash`, and `protocol` describe the payment and settlement state. `purchase_id` names the payment for a later status read.  To retrieve a SIWX-protected result, use HTTPS GET with `max_cost_usd: \"0\"`. Weft signs a fresh, resource-bound challenge with the same buyer wallet. Retrieval never falls back to payment and returns `not_required`, zero paid amount, and null held amount and transaction hash. Polls are fresh, including with repeated idempotency keys. A rejected or unsafe challenge returns `SIWX_RETRIEVAL_FAILED`. Providers must support smart-wallet signatures. Auth-only challenges also use this path; positive-budget purchases retain payment behavior.  `paid_usd` is \"0.00\" (never the nominal charge amount) until the charge is CONFIRMED settled on-chain — a signed-but-unsettled hold reports its amount in `held_usd` instead. This is a deliberate honesty fix: earlier versions of this endpoint returned the nominal amount in `paid_usd` unconditionally, even when the charge never settled.  **Money string format.** Every USD amount on this surface is exact to the micro-dollar and never narrower than two decimals: a whole-cent amount renders \"0.50\", a sub-cent amount keeps its real precision (\"0.000892\"), and zero renders \"0.00\". Amounts are never rounded — an agent reconciling its own spend reads the truth, not a display value. Parse these as decimals; do NOT compare them as strings against a bare zero literal.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**status** | **int** | HTTP status returned by the upstream after the payment or SIWX authentication retry. |
**headers** | **Dict[str, str]** | Response headers from the upstream. |
**body_base64** | **str** | Base64-encoded response body. Empty string for empty bodies. |
**paid_usd** | **str** | USD amount actually settled on-chain. \&quot;0.00\&quot; for any charge that hasn&#39;t (yet, or ever) settled — a signed hold is not yet spend. See &#x60;held_usd&#x60; for the nominal amount in that case. Exact to the micro-dollar, minimum two decimals; parse as a decimal rather than string-comparing against a bare zero literal.  |
**held_usd** | **str** | The nominal charge amount when &#x60;paid_usd&#x60; is \&quot;0.00\&quot; — a hold awaiting settlement, or a charge that failed/expired without ever settling. &#x60;null&#x60; once &#x60;paid_usd&#x60; reflects the real settlement. Same format as &#x60;paid_usd&#x60;: exact to the micro-dollar, minimum two decimals.  |
**payment_status** | **str** | Agent-facing settlement status. &#x60;not_required&#x60; means SIWX wallet authentication returned the response without payment. &#x60;pending&#x60; &#x3D; signed, no refusal signal yet (settlement may still land, e.g. x402&#39;s async facilitator webhook). &#x60;declined-pending&#x60; &#x3D; the merchant refused but the authorization isn&#39;t provably dead yet. &#x60;declined&#x60; / &#x60;expired&#x60; / &#x60;reverted&#x60; are terminal — the money never moved (or, for &#x60;reverted&#x60;, moved and then reversed on-chain) and never will for this charge.  |
**tx_hash** | **str** | Settlement transaction hash. Null until a settlement hash has been reported. |
**protocol** | **str** | Payment protocol selected for this fetch. |
**artifact_id** | **int** | Internal artifact identifier if the response was persisted; &#x60;null&#x60; otherwise. |
**purchase_id** | **str** | The buyer purchase that paid for this fetch: an opaque id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts and that purchase rows carry as &#x60;purchase_id&#x60;. It is not the sequential &#x60;Purchase.id&#x60;; do not parse or order by it. That purchase reports its own &#x60;status&#x60;, not &#x60;payment_status&#x60;: &#x60;signed&#x60; while the payment is pending, then &#x60;settled&#x60; (charged its &#x60;amount_usd&#x60;, which can be less than &#x60;held_usd&#x60;) or &#x60;declined&#x60;, &#x60;locked&#x60;, &#x60;expired&#x60;, or &#x60;reverted&#x60; (not charged). A &#x60;settled&#x60; purchase with &#x60;failure_reason: merchant_delivery_failed&#x60; was charged, but no successful paid response was delivered. An idempotent replay returns the same id, so bill at most once for each id. &#x60;null&#x60; when no payment was made (&#x60;payment_status: not_required&#x60;).  The lookup needs purchase-history access: a &#x60;wk_*&#x60; key, a claimed &#x60;wbt_*&#x60; bearer, or a REST OAuth token with the &#x60;balance&#x60; scope. An OAuth token issued for the MCP server cannot call this endpoint. Current servers always send this field. It is optional in this schema so that a client also accepts a response from an older server.  | [optional]

## Example

```python
from weft_sdk.generated.models.fetch_response import FetchResponse

# TODO update the JSON string below
json = "{}"
# create an instance of FetchResponse from a JSON string
fetch_response_instance = FetchResponse.from_json(json)
# print the JSON string representation of the object
print(FetchResponse.to_json())

# convert the object into a dict
fetch_response_dict = fetch_response_instance.to_dict()
# create an instance of FetchResponse from a dict
fetch_response_from_dict = FetchResponse.from_dict(fetch_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
