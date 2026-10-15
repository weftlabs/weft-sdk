# Fetch403Response


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**error** | **str** |  |
**details** | **Dict[str, object]** | Optional context. Shape varies by error code.  &#x60;purchase_id&#x60; (opaque string) is present when the failure follows a payment row for this request — a new, resumed, or replayed payment. It is the id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts: read that purchase to learn whether the charge settled, instead of assuming either outcome. It is absent when the request was refused before any payment row existed.  |
**policy** | [**SpendingPolicy**](SpendingPolicy.md) |  |
**balance** | [**FetchBalanceSnapshot**](FetchBalanceSnapshot.md) |  |
**dashboard_url** | **str** | Deep-link to the dashboard&#39;s policy page. |
**error_description** | **str** |  |
**scope** | **str** | Space-delimited list of scopes the endpoint requires. |

## Example

```python
from weft_sdk.generated.models.fetch403_response import Fetch403Response

# TODO update the JSON string below
json = "{}"
# create an instance of Fetch403Response from a JSON string
fetch403_response_instance = Fetch403Response.from_json(json)
# print the JSON string representation of the object
print(Fetch403Response.to_json())

# convert the object into a dict
fetch403_response_dict = fetch403_response_instance.to_dict()
# create an instance of Fetch403Response from a dict
fetch403_response_from_dict = Fetch403Response.from_dict(fetch403_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
