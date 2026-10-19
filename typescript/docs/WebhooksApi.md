# WebhooksApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createWebhookEndpoint**](WebhooksApi.md#createwebhookendpoint) | **POST** /api/v1/webhook_endpoints | Create a webhook endpoint |
| [**deleteWebhookEndpoint**](WebhooksApi.md#deletewebhookendpoint) | **DELETE** /api/v1/webhook_endpoints/{id} | Delete a webhook endpoint |
| [**getWebhookEndpoint**](WebhooksApi.md#getwebhookendpoint) | **GET** /api/v1/webhook_endpoints/{id} | Get a webhook endpoint |
| [**listWebhookEndpoints**](WebhooksApi.md#listwebhookendpoints) | **GET** /api/v1/webhook_endpoints | List webhook endpoints |
| [**replaceWebhookEndpoint**](WebhooksApi.md#replacewebhookendpoint) | **PUT** /api/v1/webhook_endpoints/{id} | Replace a webhook endpoint |
| [**updateWebhookEndpoint**](WebhooksApi.md#updatewebhookendpoint) | **PATCH** /api/v1/webhook_endpoints/{id} | Update a webhook endpoint |



## createWebhookEndpoint

> createWebhookEndpoint()

Create a webhook endpoint

Retired. Returns HTTP 410 with error code &#x60;gone&#x60;. The body is ignored.

### Example

```ts
import {
  Configuration,
  WebhooksApi,
} from '@weftlabs/sdk';
import type { CreateWebhookEndpointRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WebhooksApi(config);

  try {
    const data = await api.createWebhookEndpoint();
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

`void` (Empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **410** | Webhook endpoint management is retired. &#x60;error.code&#x60; is &#x60;gone&#x60;. |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;).  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteWebhookEndpoint

> deleteWebhookEndpoint(id)

Delete a webhook endpoint

Retired. Returns HTTP 410 with error code &#x60;gone&#x60;. Stored rows are kept.

### Example

```ts
import {
  Configuration,
  WebhooksApi,
} from '@weftlabs/sdk';
import type { DeleteWebhookEndpointRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WebhooksApi(config);

  const body = {
    // number | Webhook endpoint ID. Ignored. The response is always HTTP 410.
    id: 56,
  } satisfies DeleteWebhookEndpointRequest;

  try {
    const data = await api.deleteWebhookEndpoint(body);
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
| **id** | `number` | Webhook endpoint ID. Ignored. The response is always HTTP 410. | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **410** | Webhook endpoint management is retired. &#x60;error.code&#x60; is &#x60;gone&#x60;. |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;).  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWebhookEndpoint

> getWebhookEndpoint(id)

Get a webhook endpoint

Retired. Returns HTTP 410 with error code &#x60;gone&#x60;.

### Example

```ts
import {
  Configuration,
  WebhooksApi,
} from '@weftlabs/sdk';
import type { GetWebhookEndpointRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WebhooksApi(config);

  const body = {
    // number | Webhook endpoint ID. Ignored. The response is always HTTP 410.
    id: 56,
  } satisfies GetWebhookEndpointRequest;

  try {
    const data = await api.getWebhookEndpoint(body);
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
| **id** | `number` | Webhook endpoint ID. Ignored. The response is always HTTP 410. | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **410** | Webhook endpoint management is retired. &#x60;error.code&#x60; is &#x60;gone&#x60;. |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;).  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listWebhookEndpoints

> listWebhookEndpoints()

List webhook endpoints

Retired. Returns HTTP 410 with error code &#x60;gone&#x60;.

### Example

```ts
import {
  Configuration,
  WebhooksApi,
} from '@weftlabs/sdk';
import type { ListWebhookEndpointsRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WebhooksApi(config);

  try {
    const data = await api.listWebhookEndpoints();
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

`void` (Empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **410** | Webhook endpoint management is retired. &#x60;error.code&#x60; is &#x60;gone&#x60;. |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;).  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## replaceWebhookEndpoint

> replaceWebhookEndpoint(id)

Replace a webhook endpoint

Retired. Returns HTTP 410 with error code &#x60;gone&#x60;. The body is ignored.

### Example

```ts
import {
  Configuration,
  WebhooksApi,
} from '@weftlabs/sdk';
import type { ReplaceWebhookEndpointRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WebhooksApi(config);

  const body = {
    // number | Webhook endpoint ID. Ignored. The response is always HTTP 410.
    id: 56,
  } satisfies ReplaceWebhookEndpointRequest;

  try {
    const data = await api.replaceWebhookEndpoint(body);
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
| **id** | `number` | Webhook endpoint ID. Ignored. The response is always HTTP 410. | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **410** | Webhook endpoint management is retired. &#x60;error.code&#x60; is &#x60;gone&#x60;. |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;).  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateWebhookEndpoint

> updateWebhookEndpoint(id)

Update a webhook endpoint

Retired. Returns HTTP 410 with error code &#x60;gone&#x60;. The body is ignored.

### Example

```ts
import {
  Configuration,
  WebhooksApi,
} from '@weftlabs/sdk';
import type { UpdateWebhookEndpointRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WebhooksApi(config);

  const body = {
    // number | Webhook endpoint ID. Ignored. The response is always HTTP 410.
    id: 56,
  } satisfies UpdateWebhookEndpointRequest;

  try {
    const data = await api.updateWebhookEndpoint(body);
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
| **id** | `number` | Webhook endpoint ID. Ignored. The response is always HTTP 410. | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **410** | Webhook endpoint management is retired. &#x60;error.code&#x60; is &#x60;gone&#x60;. |  -  |
| **401** | Unauthorized |  -  |
| **403** | The credential authenticated but has no organization context (&#x60;ORGANIZATION_REQUIRED&#x60;).  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
