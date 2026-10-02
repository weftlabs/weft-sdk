# Weft::SearchEndpointCall

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **method** | **String** | The HTTP verb to send. Empty string when neither the index nor the provider&#39;s own 402 challenge / OpenAPI spec declares one.  | [optional] |
| **input_schema** | [**SearchEndpointCallInputSchema**](SearchEndpointCallInputSchema.md) |  | [optional] |
| **example_request** | **Object** | A worked set of arguments grouped by slot (&#x60;query&#x60; / &#x60;body&#x60; / &#x60;path&#x60;). Every value is one the PROVIDER published; never synthesized.  | [optional] |
| **example_response** | **Object** |  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchEndpointCall.new(
  method: null,
  input_schema: null,
  example_request: null,
  example_response: null
)
```
