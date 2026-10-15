# Weft::SearchCompactResultOperation

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | Catalog operation id. Send it as &#x60;operation_id&#x60; to &#x60;POST /api/v1/fetch&#x60;. |  |
| **name** | **String** |  | [optional] |
| **description** | **String** |  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchCompactResultOperation.new(
  id: null,
  name: null,
  description: null
)
```
