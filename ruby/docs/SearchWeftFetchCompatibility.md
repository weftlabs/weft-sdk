# Weft::SearchWeftFetchCompatibility

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **state** | **String** |  |  |
| **reason** | **String** |  |  |
| **contract_version** | **Integer** |  |  |
| **coverage** | **String** | Extent of the operation covered by weft_fetch. &#x60;terminal_response&#x60; covers the terminal result; &#x60;submission_only&#x60; covers submission but not completion or retrieval of the result; &#x60;none&#x60; means no coverage. When absent, coverage is unknown, not terminal. Do not infer terminal coverage from synchronous execution mode alone.  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchWeftFetchCompatibility.new(
  state: null,
  reason: null,
  contract_version: null,
  coverage: null
)
```
