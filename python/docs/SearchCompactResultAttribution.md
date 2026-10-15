# SearchCompactResultAttribution

Labels to send with the paid fetch so the purchase links to this search. Left out when `next_call.body` already carries them.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**search_id** | **UUID** |  | [optional]
**operation_id** | **str** |  | [optional]
**access_method_id** | **str** |  | [optional]

## Example

```python
from weft_sdk.generated.models.search_compact_result_attribution import SearchCompactResultAttribution

# TODO update the JSON string below
json = "{}"
# create an instance of SearchCompactResultAttribution from a JSON string
search_compact_result_attribution_instance = SearchCompactResultAttribution.from_json(json)
# print the JSON string representation of the object
print(SearchCompactResultAttribution.to_json())

# convert the object into a dict
search_compact_result_attribution_dict = search_compact_result_attribution_instance.to_dict()
# create an instance of SearchCompactResultAttribution from a dict
search_compact_result_attribution_from_dict = SearchCompactResultAttribution.from_dict(search_compact_result_attribution_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
