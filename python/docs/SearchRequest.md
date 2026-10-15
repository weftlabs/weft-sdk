# SearchRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**query** | **str** | Free-text query. Required and non-empty. |
**max_results** | **int** | Max number of hits to return. Invalid values are rejected, not clamped. | [optional] [default to 10]
**filters** | [**SearchFilterSpec**](SearchFilterSpec.md) |  | [optional]
**view** | **str** | Response view. Absent means &#x60;full&#x60;: the complete &#x60;SearchResult&#x60; rows in &#x60;results&#x60;. &#x60;compact&#x60; returns the hosted MCP agent view in &#x60;compact_results&#x60; (see &#x60;SearchCompactResult&#x60;). The compact view applies the same selection as hosted MCP search: it leaves out incomplete PayWithLocus gateway contracts. It does not add filters; send &#x60;weft_fetch_compatible: true&#x60; to get only results that &#x60;POST /api/v1/fetch&#x60; can pay.  | [optional]

## Example

```python
from weft_sdk.generated.models.search_request import SearchRequest

# TODO update the JSON string below
json = "{}"
# create an instance of SearchRequest from a JSON string
search_request_instance = SearchRequest.from_json(json)
# print the JSON string representation of the object
print(SearchRequest.to_json())

# convert the object into a dict
search_request_dict = search_request_instance.to_dict()
# create an instance of SearchRequest from a dict
search_request_from_dict = SearchRequest.from_dict(search_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
