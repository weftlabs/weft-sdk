# weft_sdk.generated.PaymentsApi

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_payment**](PaymentsApi.md#get_payment) | **GET** /api/v1/payments/{id} | Get payment details
[**list_payments**](PaymentsApi.md#list_payments) | **GET** /api/v1/payments | List payments


# **get_payment**
> PaymentResponse get_payment(id)

Get payment details

### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.payment_response import PaymentResponse
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure Bearer authorization (APIKey): bearerAuth
configuration = weft_sdk.generated.Configuration(
    access_token = os.environ["BEARER_TOKEN"]
)

# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.PaymentsApi(api_client)
    id = 56 # int | Payment ID

    try:
        # Get payment details
        api_response = api_instance.get_payment(id)
        print("The response of PaymentsApi->get_payment:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling PaymentsApi->get_payment: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **int**| Payment ID |

### Return type

[**PaymentResponse**](PaymentResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Payment details |  -  |
**401** | Unauthorized |  -  |
**404** | Payment not found, including a payment outside the key&#39;s product scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **list_payments**
> PaymentListResponse list_payments(page=page, per_page=per_page)

List payments

Seller payment receipts for the authenticated organization. A
resource key with `product_id` set returns only payments whose
`product_id` is that product. A resource key with `product_id` nil
returns the organization. A payment outside that scope is not found.


### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.payment_list_response import PaymentListResponse
from weft_sdk.generated.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to https://weft.network
# See configuration.py for a list of all supported configuration parameters.
configuration = weft_sdk.generated.Configuration(
    host = "https://weft.network"
)

# The client must configure the authentication and authorization parameters
# in accordance with the API server security policy.
# Examples for each auth method are provided below, use the example that
# satisfies your auth use case.

# Configure Bearer authorization (APIKey): bearerAuth
configuration = weft_sdk.generated.Configuration(
    access_token = os.environ["BEARER_TOKEN"]
)

# Enter a context with an instance of the API client
with weft_sdk.generated.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = weft_sdk.generated.PaymentsApi(api_client)
    page = 1 # int | Page number (optional) (default to 1)
    per_page = 25 # int | Items per page (optional) (default to 25)

    try:
        # List payments
        api_response = api_instance.list_payments(page=page, per_page=per_page)
        print("The response of PaymentsApi->list_payments:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling PaymentsApi->list_payments: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | **int**| Page number | [optional] [default to 1]
 **per_page** | **int**| Items per page | [optional] [default to 25]

### Return type

[**PaymentListResponse**](PaymentListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | List of payments |  -  |
**401** | Unauthorized |  -  |
**403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). Account-scoped (buyer) keys cannot read this org-scoped endpoint.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
