# PaymentsApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getPayment**](PaymentsApi.md#getpayment) | **GET** /api/v1/payments/{id} | Get payment details |
| [**listPayments**](PaymentsApi.md#listpayments) | **GET** /api/v1/payments | List payments |



## getPayment

> PaymentResponse getPayment(id)

Get payment details

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '@weftlabs/sdk';
import type { GetPaymentRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number | Payment ID
    id: 56,
  } satisfies GetPaymentRequest;

  try {
    const data = await api.getPayment(body);
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
| **id** | `number` | Payment ID | [Defaults to `undefined`] |

### Return type

[**PaymentResponse**](PaymentResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Payment details |  -  |
| **401** | Unauthorized |  -  |
| **404** | Payment not found, including a payment outside the key\&#39;s product scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listPayments

> PaymentListResponse listPayments(page, perPage)

List payments

Seller payment receipts for the authenticated organization. A resource key with &#x60;product_id&#x60; set returns only payments whose &#x60;product_id&#x60; is that product. A resource key with &#x60;product_id&#x60; nil returns the organization. A payment outside that scope is not found.

### Example

```ts
import {
  Configuration,
  PaymentsApi,
} from '@weftlabs/sdk';
import type { ListPaymentsRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new PaymentsApi(config);

  const body = {
    // number | Page number (optional)
    page: 56,
    // number | Items per page (optional)
    perPage: 56,
  } satisfies ListPaymentsRequest;

  try {
    const data = await api.listPayments(body);
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

[**PaymentListResponse**](PaymentListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of payments |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). Account-scoped (buyer) keys cannot read this org-scoped endpoint.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
