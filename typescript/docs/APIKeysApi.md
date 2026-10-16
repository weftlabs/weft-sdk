# APIKeysApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createApiKey**](APIKeysApi.md#createapikeyoperation) | **POST** /api/v1/api_keys | Create an API key |
| [**listApiKeys**](APIKeysApi.md#listapikeys) | **GET** /api/v1/api_keys | List API keys |
| [**revokeApiKey**](APIKeysApi.md#revokeapikey) | **DELETE** /api/v1/api_keys/{id} | Revoke an API key |



## createApiKey

> ApiKeyCreatedResponse createApiKey(createApiKeyRequest)

Create an API key

Create an &#x60;ax_live_*&#x60; resource key for the authenticated seller Organization. Buyer &#x60;wk_*&#x60; keys are created in the buyer dashboard.

### Example

```ts
import {
  Configuration,
  APIKeysApi,
} from '@weftlabs/sdk';
import type { CreateApiKeyOperationRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new APIKeysApi(config);

  const body = {
    // CreateApiKeyRequest
    createApiKeyRequest: ...,
  } satisfies CreateApiKeyOperationRequest;

  try {
    const data = await api.createApiKey(body);
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
| **createApiKeyRequest** | [CreateApiKeyRequest](CreateApiKeyRequest.md) |  | |

### Return type

[**ApiKeyCreatedResponse**](ApiKeyCreatedResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | API key created (includes raw key, shown only once) |  -  |
| **401** | Unauthorized |  -  |
| **422** | Validation error |  -  |
| **403** | The credential authenticated but cannot administer organization keys. Account-scoped keys have no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; set is product-scoped (&#x60;ORGANIZATION_SCOPE_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; nil keeps organization scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listApiKeys

> ApiKeyListResponse listApiKeys()

List API keys

List &#x60;ax_live_*&#x60; resource keys for the seller Organization.

### Example

```ts
import {
  Configuration,
  APIKeysApi,
} from '@weftlabs/sdk';
import type { ListApiKeysRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new APIKeysApi(config);

  try {
    const data = await api.listApiKeys();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ApiKeyListResponse**](ApiKeyListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of API keys |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but cannot administer organization keys. Account-scoped keys have no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; set is product-scoped (&#x60;ORGANIZATION_SCOPE_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; nil keeps organization scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## revokeApiKey

> MessageResponse revokeApiKey(id)

Revoke an API key

### Example

```ts
import {
  Configuration,
  APIKeysApi,
} from '@weftlabs/sdk';
import type { RevokeApiKeyRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new APIKeysApi(config);

  const body = {
    // number | API key ID
    id: 56,
  } satisfies RevokeApiKeyRequest;

  try {
    const data = await api.revokeApiKey(body);
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
| **id** | `number` | API key ID | [Defaults to `undefined`] |

### Return type

[**MessageResponse**](MessageResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | API key revoked |  -  |
| **401** | Unauthorized |  -  |
| **404** | API key not found |  -  |
| **403** | The credential authenticated but cannot administer organization keys. Account-scoped keys have no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; set is product-scoped (&#x60;ORGANIZATION_SCOPE_REQUIRED&#x60;). A resource key with &#x60;product_id&#x60; nil keeps organization scope.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
