# SearchCompactNextCall

A ready paid call, present when the request is determined and the Weft fetch runtime can pay the access method. Replace each `{name}` listed in `fill` in `body` (and add `max_cost_usd` or `body` when they are listed), then send `body` as the JSON body of `POST /api/v1/fetch` with an `Idempotency-Key` header. `body` uses the wire field names (`max_cost_usd`, `search_id`); an SDK fetch call may name them differently, so map each field and keep the attribution fields.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**method** | **str** |  |
**path** | **str** |  |
**body** | **Dict[str, object]** | A &#x60;FetchRequest&#x60; with documented example values and &#x60;{name}&#x60; placeholders. |
**fill** | **List[str]** | Names to replace before you send the request. |

## Example

```python
from weft_sdk.generated.models.search_compact_next_call import SearchCompactNextCall

# TODO update the JSON string below
json = "{}"
# create an instance of SearchCompactNextCall from a JSON string
search_compact_next_call_instance = SearchCompactNextCall.from_json(json)
# print the JSON string representation of the object
print(SearchCompactNextCall.to_json())

# convert the object into a dict
search_compact_next_call_dict = search_compact_next_call_instance.to_dict()
# create an instance of SearchCompactNextCall from a dict
search_compact_next_call_from_dict = SearchCompactNextCall.from_dict(search_compact_next_call_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
