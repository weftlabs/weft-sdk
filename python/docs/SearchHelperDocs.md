# SearchHelperDocs

Free helper links for the upstream provider. GET these URLs. Do not send them through `weft_fetch`.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**website** | **str** |  | [optional]
**homepage** | **str** |  | [optional]
**api** | **str** |  | [optional]
**llms_txt** | **str** |  | [optional]

## Example

```python
from weft_sdk.generated.models.search_helper_docs import SearchHelperDocs

# TODO update the JSON string below
json = "{}"
# create an instance of SearchHelperDocs from a JSON string
search_helper_docs_instance = SearchHelperDocs.from_json(json)
# print the JSON string representation of the object
print(SearchHelperDocs.to_json())

# convert the object into a dict
search_helper_docs_dict = search_helper_docs_instance.to_dict()
# create an instance of SearchHelperDocs from a dict
search_helper_docs_from_dict = SearchHelperDocs.from_dict(search_helper_docs_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
