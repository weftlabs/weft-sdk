# FetchRequestNot


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**max_total_cost_usd** | **str** |  |
**allow_tempo_refill** | **bool** |  |

## Example

```python
from weft_sdk.generated.models.fetch_request_not import FetchRequestNot

# TODO update the JSON string below
json = "{}"
# create an instance of FetchRequestNot from a JSON string
fetch_request_not_instance = FetchRequestNot.from_json(json)
# print the JSON string representation of the object
print(FetchRequestNot.to_json())

# convert the object into a dict
fetch_request_not_dict = fetch_request_not_instance.to_dict()
# create an instance of FetchRequestNot from a dict
fetch_request_not_from_dict = FetchRequestNot.from_dict(fetch_request_not_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
