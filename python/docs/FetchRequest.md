# FetchRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**url** | **str** | Target URL. Must pass Weft&#39;s URL safety check (no SSRF / private IP ranges). |
**max_cost_usd** | **str** | Merchant-principal ceiling, excluding gas, provider fees and prerequisites. Defaults to &#x60;0.10&#x60; USD; use &#x60;max_total_cost_usd&#x60; for an all-in bound. | [optional] [default to '0.10']
**allow_tempo_refill** | **bool** | Whether this request may create, adopt, or enqueue a Base-to-Tempo refill. Only JSON booleans are accepted. Omission allows legacy refill behavior unless &#x60;max_total_cost_usd&#x60; is supplied, in which case refill is disabled. False leaves unrelated bridges and jobs unchanged and reports an unfunded Tempo pocket as &#x60;INSUFFICIENT_BALANCE&#x60;. This does not select a rail or bound fees.  | [optional]
**max_total_cost_usd** | **str** | Optional all-in buyer-debit ceiling in USD, including principal, gas, provider fees and prerequisite operations. Requires a binding upstream upper bound before any payment effect. Current integrations have no such guarantee, so requests requiring wallet signing or payment fail closed with &#x60;TOTAL_COST_UNVERIFIABLE&#x60;, including recovery and replay of previous payments. No positive paid route is currently admitted in this mode. Estimates, expected sponsorship and receipts are not authority. Implies no refill; explicit &#x60;allow_tempo_refill: true&#x60; is invalid. Omission preserves legacy behavior.  | [optional]
**method** | **str** | HTTP method to use against the upstream. | [optional] [default to 'GET']
**body** | [**FetchRequestBody**](FetchRequestBody.md) |  | [optional]
**headers** | **Dict[str, str]** | Headers forwarded to the upstream. Up to 32 headers, 4 KB total. The following are silently stripped: &#x60;host&#x60;, &#x60;authorization&#x60;, &#x60;cookie&#x60;, &#x60;proxy-authorization&#x60;, &#x60;x-forwarded-*&#x60;, &#x60;x-real-ip&#x60;, &#x60;x-payment&#x60;, &#x60;connection&#x60;, &#x60;upgrade&#x60;.  | [optional]
**search_id** | **UUID** | The &#x60;query_trace_id&#x60; from the &#x60;POST /api/v1/search&#x60; response that surfaced this URL. Optional and advisory: it attributes the purchase to the search that found it, and is used only for measurement.  It never affects payment, authorization, idempotency, or the response body — the buyer is always resolved from the credential, never from this field. A value that is not a well-formed handle is ignored rather than rejected, so an analytics mistake can never cost a fetch.  | [optional]
**operation_id** | **str** | Advisory operation id returned by search. | [optional]
**access_method_id** | **str** | Advisory access-method id returned by search; does not enforce a payment rail. | [optional]

## Example

```python
from weft_sdk.generated.models.fetch_request import FetchRequest

# TODO update the JSON string below
json = "{}"
# create an instance of FetchRequest from a JSON string
fetch_request_instance = FetchRequest.from_json(json)
# print the JSON string representation of the object
print(FetchRequest.to_json())

# convert the object into a dict
fetch_request_dict = fetch_request_instance.to_dict()
# create an instance of FetchRequest from a dict
fetch_request_from_dict = FetchRequest.from_dict(fetch_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
