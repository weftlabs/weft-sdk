# Weft::FetchErrorResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **error** | **String** | Stable error code. |  |
| **details** | **Hash&lt;String, Object&gt;** | Optional context. Shape varies by error code.  &#x60;purchase_id&#x60; (opaque string) is present when the failure follows a payment row for this request — a new, resumed, or replayed payment. It is the id that &#x60;GET /api/v1/purchases/{id}&#x60; accepts: read that purchase to learn whether the charge settled, instead of assuming either outcome. It is absent when the request was refused before any payment row existed.  |  |
| **policy** | [**SpendingPolicy**](SpendingPolicy.md) |  |  |
| **balance** | [**FetchBalanceSnapshot**](FetchBalanceSnapshot.md) |  |  |
| **dashboard_url** | **String** | Deep-link to the dashboard&#39;s policy page. |  |

## Example

```ruby
require 'weft-sdk'

instance = Weft::FetchErrorResponse.new(
  error: EXCEEDED_MAX_COST,
  details: null,
  policy: null,
  balance: null,
  dashboard_url: null
)
```
