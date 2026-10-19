# Weft::SearchCompactAccessPrice

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **kind** | **String** | Price kind, such as &#x60;fixed&#x60;, &#x60;dynamic&#x60;, &#x60;free&#x60; or &#x60;unknown&#x60;. | [optional] |
| **indexed_usd** | **String** | Indexed USD price. A &#x60;dynamic&#x60; price is not a cap. | [optional] |
| **unit** | **String** |  | [optional] |
| **hint** | **String** |  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchCompactAccessPrice.new(
  kind: null,
  indexed_usd: null,
  unit: null,
  hint: null
)
```
