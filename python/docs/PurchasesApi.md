# weft_sdk.generated.PurchasesApi

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**get_purchase**](PurchasesApi.md#get_purchase) | **GET** /api/v1/purchases/{id} | Get a buyer purchase
[**list_purchases**](PurchasesApi.md#list_purchases) | **GET** /api/v1/purchases | List buyer purchases


# **get_purchase**
> PurchaseResponse get_purchase(id)

Get a buyer purchase

### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.purchase_response import PurchaseResponse
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
    api_instance = weft_sdk.generated.PurchasesApi(api_client)
    id = weft_sdk.generated.GetPurchaseIdParameter() # GetPurchaseIdParameter | The opaque `purchase_id` (`pur_…`) that fetch returns, or the legacy integer `id`. Both resolve only within the caller's own purchases. New callers should store and send `purchase_id`.

    try:
        # Get a buyer purchase
        api_response = api_instance.get_purchase(id)
        print("The response of PurchasesApi->get_purchase:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling PurchasesApi->get_purchase: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | [**GetPurchaseIdParameter**](.md)| The opaque &#x60;purchase_id&#x60; (&#x60;pur_…&#x60;) that fetch returns, or the legacy integer &#x60;id&#x60;. Both resolve only within the caller&#39;s own purchases. New callers should store and send &#x60;purchase_id&#x60;.  |

### Return type

[**PurchaseResponse**](PurchaseResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Buyer purchase details |  -  |
**401** | Unauthorized — missing or non-buyer-scoped credential |  -  |
**403** | OAuth token lacks the &#x60;balance&#x60; scope. |  -  |
**404** | Purchase not found or owned by another buyer |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **list_purchases**
> PurchaseListResponse list_purchases(page=page, per_page=per_page)

List buyer purchases

Returns the authenticated buyer's signing and settlement ledger. Unlike
`/api/v1/payments`, this endpoint is User-scoped and backed by
`signed_events`, so rejected and pending attempts are included.

Scoped to the buyer's own merchant spend, matching the dashboard's
Purchases page. Internal signings are excluded: historical refill
self-transfers (`rebalance`) and operator signings (`manual`) are not
payments the buyer made and never appear here.


### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.purchase_list_response import PurchaseListResponse
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
    api_instance = weft_sdk.generated.PurchasesApi(api_client)
    page = 1 # int | Page number (optional) (default to 1)
    per_page = 25 # int | Items per page (optional) (default to 25)

    try:
        # List buyer purchases
        api_response = api_instance.list_purchases(page=page, per_page=per_page)
        print("The response of PurchasesApi->list_purchases:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling PurchasesApi->list_purchases: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | **int**| Page number | [optional] [default to 1]
 **per_page** | **int**| Items per page | [optional] [default to 25]

### Return type

[**PurchaseListResponse**](PurchaseListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Buyer purchase ledger |  -  |
**401** | Unauthorized — missing or non-buyer-scoped credential |  -  |
**403** | OAuth token lacks the &#x60;balance&#x60; scope. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
