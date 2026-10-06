# SearchWeftFetchCompatibility


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**state** | **str** |  |
**reason** | **str** |  |
**contract_version** | **int** |  |
**coverage** | **str** | Extent of the operation covered by weft_fetch. &#x60;terminal_response&#x60; covers the terminal result; &#x60;submission_only&#x60; covers submission but not completion or retrieval of the result; &#x60;none&#x60; means no coverage. When absent, coverage is unknown, not terminal. Do not infer terminal coverage from synchronous execution mode alone.  | [optional]

## Example

```python
from weft_sdk.generated.models.search_weft_fetch_compatibility import SearchWeftFetchCompatibility

# TODO update the JSON string below
json = "{}"
# create an instance of SearchWeftFetchCompatibility from a JSON string
search_weft_fetch_compatibility_instance = SearchWeftFetchCompatibility.from_json(json)
# print the JSON string representation of the object
print(SearchWeftFetchCompatibility.to_json())

# convert the object into a dict
search_weft_fetch_compatibility_dict = search_weft_fetch_compatibility_instance.to_dict()
# create an instance of SearchWeftFetchCompatibility from a dict
search_weft_fetch_compatibility_from_dict = SearchWeftFetchCompatibility.from_dict(search_weft_fetch_compatibility_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
