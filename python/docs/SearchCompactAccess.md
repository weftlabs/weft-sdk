# SearchCompactAccess

The recommended access method for this operation.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **str** | The &#x60;access_method_id&#x60; to send to &#x60;POST /api/v1/fetch&#x60;. | [optional]
**protocol** | **str** |  | [optional]
**weft_fetch** | **Dict[str, object]** | Whether the Weft fetch runtime can pay this access method (&#x60;state&#x60;, and &#x60;reason&#x60; and &#x60;coverage&#x60; when they fit). | [optional]
**price** | [**SearchCompactAccessPrice**](SearchCompactAccessPrice.md) |  | [optional]

## Example

```python
from weft_sdk.generated.models.search_compact_access import SearchCompactAccess

# TODO update the JSON string below
json = "{}"
# create an instance of SearchCompactAccess from a JSON string
search_compact_access_instance = SearchCompactAccess.from_json(json)
# print the JSON string representation of the object
print(SearchCompactAccess.to_json())

# convert the object into a dict
search_compact_access_dict = search_compact_access_instance.to_dict()
# create an instance of SearchCompactAccess from a dict
search_compact_access_from_dict = SearchCompactAccess.from_dict(search_compact_access_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
