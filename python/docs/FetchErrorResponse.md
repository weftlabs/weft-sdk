# FetchErrorResponse

Bespoke error envelope for `/api/v1/fetch`. Every error carries the buyer's current `policy`, `balance`, and a `dashboard_url` so a CLI can render an actionable message without a second round-trip.  `error` values include the fixed codes listed below plus the `POLICY_VIOLATION_<REASON>` family, where `<REASON>` is the violated policy field (`MAX_TX`, `DAILY`, or `WEEKLY` — see `PolicyViolation::REASONS`).

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**error** | **str** | Stable error code. |
**details** | **Dict[str, object]** | Optional context. Shape varies by error code.  &#x60;purchase_id&#x60; (opaque string) is present when the failure follows a payment row for this request — a new, resumed, or replayed payment. It is the id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts: read that purchase to learn whether the charge settled, instead of assuming either outcome. It is absent when the request was refused before any payment row existed.  |
**policy** | [**SpendingPolicy**](SpendingPolicy.md) |  |
**balance** | [**FetchBalanceSnapshot**](FetchBalanceSnapshot.md) |  |
**dashboard_url** | **str** | Deep-link to the dashboard&#39;s policy page. |

## Example

```python
from weft_sdk.generated.models.fetch_error_response import FetchErrorResponse

# TODO update the JSON string below
json = "{}"
# create an instance of FetchErrorResponse from a JSON string
fetch_error_response_instance = FetchErrorResponse.from_json(json)
# print the JSON string representation of the object
print(FetchErrorResponse.to_json())

# convert the object into a dict
fetch_error_response_dict = fetch_error_response_instance.to_dict()
# create an instance of FetchErrorResponse from a dict
fetch_error_response_from_dict = FetchErrorResponse.from_dict(fetch_error_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
