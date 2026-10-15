# SearchCompactResult

One row of the compact agent view: the minimum contract for the next paid call, below 2,000 JSON bytes. It is the hosted MCP `weft_search` projection with REST references: `contract_url` replaces the MCP `weft_contract` call, and `next_call` is a `POST /api/v1/fetch` request instead of an MCP `weft_fetch` call. To stay in the budget, the row drops optional fields in a fixed order (optional inputs, helper docs, the example, the description, then summaries) and `contract_detail` says what is left out. In the last resort the row keeps the operation id, readiness states, the `weft_fetch` state, `contract_url` and the search id, and can lose the input names, the request recipe and price. The full contract at `contract_url` is always complete. The search id is the envelope `query_trace_id`; each row also carries it in `attribution` or in `next_call.body`.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**provider** | [**SearchCompactResultProvider**](SearchCompactResultProvider.md) |  | [optional]
**operation** | [**SearchCompactResultOperation**](SearchCompactResultOperation.md) |  |
**inputs** | **Dict[str, object]** | Typed business inputs (a bounded JSON schema), or the names and locations of the required inputs when the full schema does not fit. Read the full contract before you send an input not listed.  | [optional]
**request** | **Dict[str, object]** | The request recipe: &#x60;method&#x60;, canonical &#x60;url&#x60;, and, when known, the path, query, header and JSON body bindings of each input.  | [optional]
**example** | **object** |  | [optional]
**access** | [**SearchCompactAccess**](SearchCompactAccess.md) |  |
**attribution** | [**SearchCompactResultAttribution**](SearchCompactResultAttribution.md) |  | [optional]
**output** | **Dict[str, object]** | Media type, execution mode, a bounded output summary and, for async work, the poll workflow. | [optional]
**docs** | [**SearchHelperDocs**](SearchHelperDocs.md) |  | [optional]
**contract_url** | **str** | Content-addressed full Weft contract. GET it with your Weft credential (a buyer account key, an OAuth token with the &#x60;search&#x60; scope, or a claimed &#x60;wbt_*&#x60; bootstrap bearer) before you build a request the summary does not fully describe. A pending bootstrap bearer gets &#x60;401&#x60; until a human approves the account.  |
**contract_detail** | **str** | What this summary leaves out of the full contract. |
**completion** | **str** | Completion guidance when the completion rules did not fit inline. | [optional]
**blocked_scopes** | [**List[SearchCompactResultBlockedScopesInner]**](SearchCompactResultBlockedScopesInner.md) |  | [optional]
**contract_gaps** | **List[str]** | Contract fields that the review did not complete. | [optional]
**readiness** | [**Dict[str, SearchCompactResultBlockedScopesInner]**](SearchCompactResultBlockedScopesInner.md) | Independent readiness claims (&#x60;research&#x60;, &#x60;contract&#x60;, &#x60;runtime&#x60;, &#x60;paid_terminal&#x60;), each with a &#x60;state&#x60; and, when it fits, a &#x60;scope&#x60;.  |
**next_call** | [**SearchCompactNextCall**](SearchCompactNextCall.md) |  | [optional]

## Example

```python
from weft_sdk.generated.models.search_compact_result import SearchCompactResult

# TODO update the JSON string below
json = "{}"
# create an instance of SearchCompactResult from a JSON string
search_compact_result_instance = SearchCompactResult.from_json(json)
# print the JSON string representation of the object
print(SearchCompactResult.to_json())

# convert the object into a dict
search_compact_result_dict = search_compact_result_instance.to_dict()
# create an instance of SearchCompactResult from a dict
search_compact_result_from_dict = SearchCompactResult.from_dict(search_compact_result_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
