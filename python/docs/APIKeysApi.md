# weft_sdk.generated.APIKeysApi

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**create_api_key**](APIKeysApi.md#create_api_key) | **POST** /api/v1/api_keys | Create an API key
[**list_api_keys**](APIKeysApi.md#list_api_keys) | **GET** /api/v1/api_keys | List API keys
[**revoke_api_key**](APIKeysApi.md#revoke_api_key) | **DELETE** /api/v1/api_keys/{id} | Revoke an API key


# **create_api_key**
> ApiKeyCreatedResponse create_api_key(create_api_key_request)

Create an API key

Create an `ax_live_*` resource key for the authenticated seller
Organization. Buyer `wk_*` keys are created in the buyer dashboard.


### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.api_key_created_response import ApiKeyCreatedResponse
from weft_sdk.generated.models.create_api_key_request import CreateApiKeyRequest
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
    api_instance = weft_sdk.generated.APIKeysApi(api_client)
    create_api_key_request = weft_sdk.generated.CreateApiKeyRequest() # CreateApiKeyRequest |

    try:
        # Create an API key
        api_response = api_instance.create_api_key(create_api_key_request)
        print("The response of APIKeysApi->create_api_key:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling APIKeysApi->create_api_key: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **create_api_key_request** | [**CreateApiKeyRequest**](CreateApiKeyRequest.md)|  |

### Return type

[**ApiKeyCreatedResponse**](ApiKeyCreatedResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**201** | API key created (includes raw key, shown only once) |  -  |
**401** | Unauthorized |  -  |
**422** | Validation error |  -  |
**403** | The credential authenticated but cannot administer organization keys. Account-scoped keys have no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; set is product-scoped (&#x60;ORGANIZATION_SCOPE_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; nil keeps organization scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **list_api_keys**
> ApiKeyListResponse list_api_keys()

List API keys

List `ax_live_*` resource keys for the seller Organization.

### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.api_key_list_response import ApiKeyListResponse
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
    api_instance = weft_sdk.generated.APIKeysApi(api_client)

    try:
        # List API keys
        api_response = api_instance.list_api_keys()
        print("The response of APIKeysApi->list_api_keys:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling APIKeysApi->list_api_keys: %s\n" % e)
```



### Parameters

This endpoint does not need any parameter.

### Return type

[**ApiKeyListResponse**](ApiKeyListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | List of API keys |  -  |
**401** | Unauthorized |  -  |
**403** | The credential authenticated but cannot administer organization keys. Account-scoped keys have no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; set is product-scoped (&#x60;ORGANIZATION_SCOPE_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; nil keeps organization scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **revoke_api_key**
> MessageResponse revoke_api_key(id)

Revoke an API key

### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.message_response import MessageResponse
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
    api_instance = weft_sdk.generated.APIKeysApi(api_client)
    id = 56 # int | API key ID

    try:
        # Revoke an API key
        api_response = api_instance.revoke_api_key(id)
        print("The response of APIKeysApi->revoke_api_key:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling APIKeysApi->revoke_api_key: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **int**| API key ID |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | API key revoked |  -  |
**401** | Unauthorized |  -  |
**404** | API key not found |  -  |
**403** | The credential authenticated but cannot administer organization keys. Account-scoped keys have no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; set is product-scoped (&#x60;ORGANIZATION_SCOPE_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; nil keeps organization scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
