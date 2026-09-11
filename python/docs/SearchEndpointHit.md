# SearchEndpointHit


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**endpoint_id** | **str** |  | [optional]
**url** | **str** |  | [optional]
**resource_type** | **str** |  | [optional]
**primary_protocol** | **str** |  | [optional]
**call** | [**SearchEndpointCall**](SearchEndpointCall.md) |  | [optional]
**price** | [**SearchEndpointPrice**](SearchEndpointPrice.md) |  | [optional]
**payment** | [**List[SearchPaymentOffer]**](SearchPaymentOffer.md) | The settlement routes this endpoint&#39;s own 402 challenge published — one entry per rail × network × asset × payee it accepts. Sibling of &#x60;call&#x60;: that block says how to shape the request, this says how to pay for it, so a caller can settle with its OWN x402/mpp SDK instead of guessing. A list because rails are irreducibly plural. Order is the provider&#39;s own preference order. Honest-empty when the pipeline observed no challenge.  | [optional]
**access_methods** | [**List[SearchAccessMethod]**](SearchAccessMethod.md) |  | [optional]
**service** | [**SearchCuratedService**](SearchCuratedService.md) |  | [optional]
**operation** | [**SearchCuratedOperation**](SearchCuratedOperation.md) |  | [optional]
**docs** | [**SearchHelperDocs**](SearchHelperDocs.md) |  | [optional]
**contract_url** | **str** | Content-addressed Weft contract for the complete operation, alternatives, evidence, and known gaps. Authenticated GET.  | [optional]
**output_schema** | **object** |  | [optional]
**output** | **object** |  | [optional]
**execution** | [**SearchCuratedExecution**](SearchCuratedExecution.md) |  | [optional]
**callability** | [**SearchCuratedCallability**](SearchCuratedCallability.md) |  | [optional]
**compatibility** | **object** |  | [optional]
**source** | [**SearchCuratedSource**](SearchCuratedSource.md) |  | [optional]
**operator_type** | **str** | Who you are actually paying. &#x60;first_party&#x60; &#x3D; operated by the provider that makes the capability; &#x60;reseller&#x60; &#x3D; resold, so the price carries someone else&#39;s margin. Null until the platform resolves the operator.  | [optional]
**operated_by_id** | **str** |  | [optional]
**settled_via_facilitator_id** | **str** |  | [optional]
**settlements** | **int** | Count of payments observed settling against this endpoint by ANYONE (chain-indexed), not just by Weft — the reliability signal a caller can act on. Null when unknown.  | [optional]
**last_verified_at** | **datetime** | When Weft last CONFIRMED this endpoint answers — the most recent conclusive probe. Null when never probed, or when the latest probe errored: an endpoint we last failed to reach has no current verification.  | [optional]
**latency_p50_ms** | **int** | Median time-to-first-byte in ms across the endpoint&#39;s probe call set. First-byte latency, not full-response time. Null when unmeasured (never 0).  | [optional]

## Example

```python
from weft_sdk.generated.models.search_endpoint_hit import SearchEndpointHit

# TODO update the JSON string below
json = "{}"
# create an instance of SearchEndpointHit from a JSON string
search_endpoint_hit_instance = SearchEndpointHit.from_json(json)
# print the JSON string representation of the object
print(SearchEndpointHit.to_json())

# convert the object into a dict
search_endpoint_hit_dict = search_endpoint_hit_instance.to_dict()
# create an instance of SearchEndpointHit from a dict
search_endpoint_hit_from_dict = SearchEndpointHit.from_dict(search_endpoint_hit_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
