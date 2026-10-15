# PurchasesApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getPurchase**](PurchasesApi.md#getpurchase) | **GET** /api/v1/purchases/{id} | Get a buyer purchase |
| [**listPurchases**](PurchasesApi.md#listpurchases) | **GET** /api/v1/purchases | List buyer purchases |



## getPurchase

> PurchaseResponse getPurchase(id)

Get a buyer purchase

### Example

```ts
import {
  Configuration,
  PurchasesApi,
} from '@weftlabs/sdk';
import type { GetPurchaseRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new PurchasesApi(config);

  const body = {
    // GetPurchaseIdParameter | The opaque `purchase_id` (`pur_…`) that fetch returns, or the legacy integer `id`. Both resolve only within the caller\'s own purchases. New callers should store and send `purchase_id`.
    id: ...,
  } satisfies GetPurchaseRequest;

  try {
    const data = await api.getPurchase(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | [](.md) | The opaque &#x60;purchase_id&#x60; (&#x60;pur_…&#x60;) that fetch returns, or the legacy integer &#x60;id&#x60;. Both resolve only within the caller\&#39;s own purchases. New callers should store and send &#x60;purchase_id&#x60;.  | [Defaults to `undefined`] |

### Return type

[**PurchaseResponse**](PurchaseResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Buyer purchase details |  -  |
| **401** | Unauthorized — missing or non-buyer-scoped credential |  -  |
| **403** | OAuth token lacks the &#x60;balance&#x60; scope. |  -  |
| **404** | Purchase not found or owned by another buyer |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listPurchases

> PurchaseListResponse listPurchases(page, perPage)

List buyer purchases

Returns the authenticated buyer\&#39;s signing and settlement ledger. Unlike &#x60;/api/v1/payments&#x60;, this endpoint is User-scoped and backed by &#x60;signed_events&#x60;, so rejected and pending attempts are included.  Scoped to the buyer\&#39;s own merchant spend, matching the dashboard\&#39;s Purchases page. Internal signings are excluded: historical refill self-transfers (&#x60;rebalance&#x60;) and operator signings (&#x60;manual&#x60;) are not payments the buyer made and never appear here.

### Example

```ts
import {
  Configuration,
  PurchasesApi,
} from '@weftlabs/sdk';
import type { ListPurchasesRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new PurchasesApi(config);

  const body = {
    // number | Page number (optional)
    page: 56,
    // number | Items per page (optional)
    perPage: 56,
  } satisfies ListPurchasesRequest;

  try {
    const data = await api.listPurchases(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **page** | `number` | Page number | [Optional] [Defaults to `1`] |
| **perPage** | `number` | Items per page | [Optional] [Defaults to `25`] |

### Return type

[**PurchaseListResponse**](PurchaseListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Buyer purchase ledger |  -  |
| **401** | Unauthorized — missing or non-buyer-scoped credential |  -  |
| **403** | OAuth token lacks the &#x60;balance&#x60; scope. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
