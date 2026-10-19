# Weft::SearchCompactResult

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **provider** | [**SearchCompactResultProvider**](SearchCompactResultProvider.md) |  | [optional] |
| **operation** | [**SearchCompactResultOperation**](SearchCompactResultOperation.md) |  |  |
| **inputs** | **Hash&lt;String, Object&gt;** | Typed business inputs (a bounded JSON schema), or the names and locations of the required inputs when the full schema does not fit. Read the full contract before you send an input not listed.  | [optional] |
| **request** | **Hash&lt;String, Object&gt;** | The request recipe: &#x60;method&#x60;, canonical &#x60;url&#x60;, and, when known, the path, query, header and JSON body bindings of each input.  | [optional] |
| **example** | **Object** |  | [optional] |
| **access** | [**SearchCompactAccess**](SearchCompactAccess.md) |  |  |
| **attribution** | [**SearchCompactResultAttribution**](SearchCompactResultAttribution.md) |  | [optional] |
| **output** | **Hash&lt;String, Object&gt;** | Media type, execution mode, a bounded output summary and, for async work, the poll workflow. | [optional] |
| **docs** | [**SearchHelperDocs**](SearchHelperDocs.md) |  | [optional] |
| **contract_url** | **String** | Content-addressed full Weft contract. GET it with your Weft credential (a buyer account key, an OAuth token with the &#x60;search&#x60; scope, or a claimed &#x60;wbt_*&#x60; bootstrap bearer) before you build a request the summary does not fully describe. A pending bootstrap bearer gets &#x60;401&#x60; until a human approves the account.  |  |
| **contract_detail** | **String** | What this summary leaves out of the full contract. |  |
| **completion** | **String** | Completion guidance when the completion rules did not fit inline. | [optional] |
| **blocked_scopes** | [**Array&lt;SearchCompactResultBlockedScopesInner&gt;**](SearchCompactResultBlockedScopesInner.md) |  | [optional] |
| **contract_gaps** | **Array&lt;String&gt;** | Contract fields that the review did not complete. | [optional] |
| **readiness** | [**Hash&lt;String, SearchCompactResultBlockedScopesInner&gt;**](SearchCompactResultBlockedScopesInner.md) | Independent readiness claims (&#x60;research&#x60;, &#x60;contract&#x60;, &#x60;runtime&#x60;, &#x60;paid_terminal&#x60;), each with a &#x60;state&#x60; and, when it fits, a &#x60;scope&#x60;.  |  |
| **next_call** | [**SearchCompactNextCall**](SearchCompactNextCall.md) |  | [optional] |

## Example

```ruby
require 'weft-sdk'

instance = Weft::SearchCompactResult.new(
  provider: null,
  operation: null,
  inputs: null,
  request: null,
  example: null,
  access: null,
  attribution: null,
  output: null,
  docs: null,
  contract_url: null,
  contract_detail: null,
  completion: null,
  blocked_scopes: null,
  contract_gaps: null,
  readiness: null,
  next_call: null
)
```
