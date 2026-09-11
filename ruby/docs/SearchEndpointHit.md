# Weft::SearchEndpointHit

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **endpoint_id** | **String** |  | [optional] |
| **url** | **String** |  | [optional] |
| **resource_type** | **String** |  | [optional] |
| **primary_protocol** | **String** |  | [optional] |
| **call** | [**SearchEndpointCall**](SearchEndpointCall.md) |  | [optional] |
| **price** | [**SearchEndpointPrice**](SearchEndpointPrice.md) |  | [optional] |
| **payment** | [**Array&lt;SearchPaymentOffer&gt;**](SearchPaymentOffer.md) | The settlement routes this endpoint&#39;s own 402 challenge published — one entry per rail × network × asset × payee it accepts. Sibling of &#x60;call&#x60;: that block says how to shape the request, this says how to pay for it, so a caller can settle with its OWN x402/mpp SDK instead of guessing. A list because rails are irreducibly plural. Order is the provider&#39;s own preference order. Honest-empty when the pipeline observed no challenge.  | [optional] |
| **access_methods** | [**Array&lt;SearchAccessMethod&gt;**](SearchAccessMethod.md) |  | [optional] |
| **service** | [**SearchCuratedService**](SearchCuratedService.md) |  | [optional] |
| **operation** | [**SearchCuratedOperation**](SearchCuratedOperation.md) |  | [optional] |
| **docs** | [**SearchHelperDocs**](SearchHelperDocs.md) |  | [optional] |
| **contract_url** | **String** | Content-addressed Weft contract for the complete operation, alternatives, evidence, and known gaps. Authenticated GET.  | [optional] |
| **output_schema** | **Object** |  | [optional] |
| **output** | **Object** |  | [optional] |
| **execution** | [**SearchCuratedExecution**](SearchCuratedExecution.md) |  | [optional] |
| **callability** | [**SearchCuratedCallability**](SearchCuratedCallability.md) |  | [optional] |
| **compatibility** | **Object** |  | [optional] |
| **source** | [**SearchCuratedSource**](SearchCuratedSource.md) |  | [optional] |
| **operator_type** | **String** | Who you are actually paying. &#x60;first_party&#x60; &#x3D; operated by the provider that makes the capability; &#x60;reseller&#x60; &#x3D; resold, so the price carries someone else&#39;s margin. Null until the platform resolves the operator.  | [optional] |
| **operated_by_id** | **String** |  | [optional] |
| **settled_via_facilitator_id** | **String** |  | [optional] |
| **settlements** | **Integer** | Count of payments observed settling against this endpoint by ANYONE (chain-indexed), not just by Weft — the reliability signal a caller can act on. Null when unknown.  | [optional] |
| **last_verified_at** | **Time** | When Weft last CONFIRMED this endpoint answers — the most recent conclusive probe. Null when never probed, or when the latest probe errored: an endpoint we last failed to reach has no current verification.  | [optional] |
| **latency_p50_ms** | **Integer** | Median time-to-first-byte in ms across the endpoint&#39;s probe call set. First-byte latency, not full-response time. Null when unmeasured (never 0).  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchEndpointHit.new(
  endpoint_id: null,
  url: null,
  resource_type: null,
  primary_protocol: null,
  call: null,
  price: null,
  payment: null,
  access_methods: null,
  service: null,
  operation: null,
  docs: null,
  contract_url: null,
  output_schema: null,
  output: null,
  execution: null,
  callability: null,
  compatibility: null,
  source: null,
  operator_type: null,
  operated_by_id: null,
  settled_via_facilitator_id: null,
  settlements: null,
  last_verified_at: null,
  latency_p50_ms: null
)
```
