# Weft::SearchRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **query** | **String** | Free-text query. Required and non-empty. |  |
| **max_results** | **Integer** | Max number of hits to return. Invalid values are rejected, not clamped. | [optional][default to 10] |
| **filters** | [**SearchFilterSpec**](SearchFilterSpec.md) |  | [optional] |
| **view** | **String** | Response view. Absent means &#x60;full&#x60;: the complete &#x60;SearchResult&#x60; rows in &#x60;results&#x60;. &#x60;compact&#x60; returns the hosted MCP agent view in &#x60;compact_results&#x60; (see &#x60;SearchCompactResult&#x60;). The compact view applies the same selection as hosted MCP search: it leaves out incomplete PayWithLocus gateway contracts. It does not add filters; send &#x60;weft_fetch_compatible: true&#x60; to get only results that &#x60;POST /api/v1/fetch&#x60; can pay.  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchRequest.new(
  query: send email from an agent,
  max_results: null,
  filters: null,
  view: null
)
```
