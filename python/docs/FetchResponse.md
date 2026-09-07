# FetchResponse

Successful fetch envelope. `body_base64` is the upstream artifact bytes, base64-encoded. `paid_usd`, `held_usd`, `payment_status`, `tx_hash`, and `protocol` describe the payment and settlement state.  `paid_usd` is \"0.00\" (never the nominal charge amount) until the charge is CONFIRMED settled on-chain — a signed-but-unsettled hold reports its amount in `held_usd` instead. This is a deliberate honesty fix: earlier versions of this endpoint returned the nominal amount in `paid_usd` unconditionally, even when the charge never settled.  **Money string format.** Every USD amount on this surface is exact to the micro-dollar and never narrower than two decimals: a whole-cent amount renders \"0.50\", a sub-cent amount keeps its real precision (\"0.000892\"), and zero renders \"0.00\". Amounts are never rounded — an agent reconciling its own spend reads the truth, not a display value. Parse these as decimals; do NOT compare them as strings against a bare zero literal.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**status** | **int** | HTTP status returned by the upstream after the paid replay. |
**headers** | **Dict[str, str]** | Response headers from the upstream. |
**body_base64** | **str** | Base64-encoded response body. Empty string for empty bodies. |
**paid_usd** | **str** | USD amount actually settled on-chain. \&quot;0.00\&quot; for any charge that hasn&#39;t (yet, or ever) settled — a signed hold is not yet spend. See &#x60;held_usd&#x60; for the nominal amount in that case. Exact to the micro-dollar, minimum two decimals; parse as a decimal rather than string-comparing against a bare zero literal.  |
**held_usd** | **str** | The nominal charge amount when &#x60;paid_usd&#x60; is \&quot;0.00\&quot; — a hold awaiting settlement, or a charge that failed/expired without ever settling. &#x60;null&#x60; once &#x60;paid_usd&#x60; reflects the real settlement. Same format as &#x60;paid_usd&#x60;: exact to the micro-dollar, minimum two decimals.  |
**payment_status** | **str** | Agent-facing settlement status. &#x60;pending&#x60; &#x3D; signed, no refusal signal yet (settlement may still land, e.g. x402&#39;s async facilitator webhook). &#x60;declined-pending&#x60; &#x3D; the merchant refused but the authorization isn&#39;t provably dead yet. &#x60;declined&#x60; / &#x60;expired&#x60; / &#x60;reverted&#x60; are terminal — the money never moved (or, for &#x60;reverted&#x60;, moved and then reversed on-chain) and never will for this charge.  |
**tx_hash** | **str** | Settlement transaction hash. Null until a settlement hash has been reported. |
**protocol** | **str** | Payment protocol selected for this fetch. |
**artifact_id** | **int** | Internal artifact identifier if the response was persisted; &#x60;null&#x60; otherwise. |

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
