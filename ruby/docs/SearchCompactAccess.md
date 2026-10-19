# Weft::SearchCompactAccess

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | The &#x60;access_method_id&#x60; to send to &#x60;POST /api/v1/fetch&#x60;. | [optional] |
| **protocol** | **String** |  | [optional] |
| **weft_fetch** | **Hash&lt;String, Object&gt;** | Whether the Weft fetch runtime can pay this access method (&#x60;state&#x60;, and &#x60;reason&#x60; and &#x60;coverage&#x60; when they fit). | [optional] |
| **price** | [**SearchCompactAccessPrice**](SearchCompactAccessPrice.md) |  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchCompactAccess.new(
  id: null,
  protocol: null,
  weft_fetch: null,
  price: null
)
```
