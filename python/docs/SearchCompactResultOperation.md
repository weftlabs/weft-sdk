# SearchCompactResultOperation


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **str** | Catalog operation id. Send it as &#x60;operation_id&#x60; to &#x60;POST /api/v1/fetch&#x60;. |
**name** | **str** |  | [optional]
**description** | **str** |  | [optional]

## Example

```python
from weft_sdk.generated.models.search_compact_result_operation import SearchCompactResultOperation

# TODO update the JSON string below
json = "{}"
# create an instance of SearchCompactResultOperation from a JSON string
search_compact_result_operation_instance = SearchCompactResultOperation.from_json(json)
# print the JSON string representation of the object
print(SearchCompactResultOperation.to_json())

# convert the object into a dict
search_compact_result_operation_dict = search_compact_result_operation_instance.to_dict()
# create an instance of SearchCompactResultOperation from a dict
search_compact_result_operation_from_dict = SearchCompactResultOperation.from_dict(search_compact_result_operation_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
