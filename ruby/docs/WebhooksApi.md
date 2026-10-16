# Weft::WebhooksApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
| ------ | ------------ | ----------- |
| [**create_webhook_endpoint**](WebhooksApi.md#create_webhook_endpoint) | **POST** /api/v1/webhook_endpoints | Create a webhook endpoint |
| [**delete_webhook_endpoint**](WebhooksApi.md#delete_webhook_endpoint) | **DELETE** /api/v1/webhook_endpoints/{id} | Delete a webhook endpoint |
| [**get_webhook_endpoint**](WebhooksApi.md#get_webhook_endpoint) | **GET** /api/v1/webhook_endpoints/{id} | Get a webhook endpoint |
| [**list_webhook_endpoints**](WebhooksApi.md#list_webhook_endpoints) | **GET** /api/v1/webhook_endpoints | List webhook endpoints |
| [**replace_webhook_endpoint**](WebhooksApi.md#replace_webhook_endpoint) | **PUT** /api/v1/webhook_endpoints/{id} | Replace a webhook endpoint |
| [**update_webhook_endpoint**](WebhooksApi.md#update_webhook_endpoint) | **PATCH** /api/v1/webhook_endpoints/{id} | Update a webhook endpoint |


## create_webhook_endpoint

> create_webhook_endpoint

Create a webhook endpoint

Retired. Returns HTTP 410 with error code `gone`. The body is ignored.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::WebhooksApi.new

begin
  # Create a webhook endpoint
  api_instance.create_webhook_endpoint
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->create_webhook_endpoint: #{e}"
end
```

#### Using the create_webhook_endpoint_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> create_webhook_endpoint_with_http_info

```ruby
begin
  # Create a webhook endpoint
  data, status_code, headers = api_instance.create_webhook_endpoint_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->create_webhook_endpoint_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

nil (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## delete_webhook_endpoint

> delete_webhook_endpoint(id)

Delete a webhook endpoint

Retired. Returns HTTP 410 with error code `gone`. Stored rows are kept.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::WebhooksApi.new
id = 56 # Integer | Webhook endpoint ID. Ignored. The response is always HTTP 410.

begin
  # Delete a webhook endpoint
  api_instance.delete_webhook_endpoint(id)
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->delete_webhook_endpoint: #{e}"
end
```

#### Using the delete_webhook_endpoint_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> delete_webhook_endpoint_with_http_info(id)

```ruby
begin
  # Delete a webhook endpoint
  data, status_code, headers = api_instance.delete_webhook_endpoint_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->delete_webhook_endpoint_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **Integer** | Webhook endpoint ID. Ignored. The response is always HTTP 410. |  |

### Return type

nil (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_webhook_endpoint

> get_webhook_endpoint(id)

Get a webhook endpoint

Retired. Returns HTTP 410 with error code `gone`.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::WebhooksApi.new
id = 56 # Integer | Webhook endpoint ID. Ignored. The response is always HTTP 410.

begin
  # Get a webhook endpoint
  api_instance.get_webhook_endpoint(id)
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->get_webhook_endpoint: #{e}"
end
```

#### Using the get_webhook_endpoint_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> get_webhook_endpoint_with_http_info(id)

```ruby
begin
  # Get a webhook endpoint
  data, status_code, headers = api_instance.get_webhook_endpoint_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->get_webhook_endpoint_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **Integer** | Webhook endpoint ID. Ignored. The response is always HTTP 410. |  |

### Return type

nil (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_webhook_endpoints

> list_webhook_endpoints

List webhook endpoints

Retired. Returns HTTP 410 with error code `gone`.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::WebhooksApi.new

begin
  # List webhook endpoints
  api_instance.list_webhook_endpoints
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->list_webhook_endpoints: #{e}"
end
```

#### Using the list_webhook_endpoints_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> list_webhook_endpoints_with_http_info

```ruby
begin
  # List webhook endpoints
  data, status_code, headers = api_instance.list_webhook_endpoints_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->list_webhook_endpoints_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

nil (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## replace_webhook_endpoint

> replace_webhook_endpoint(id)

Replace a webhook endpoint

Retired. Returns HTTP 410 with error code `gone`. The body is ignored.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::WebhooksApi.new
id = 56 # Integer | Webhook endpoint ID. Ignored. The response is always HTTP 410.

begin
  # Replace a webhook endpoint
  api_instance.replace_webhook_endpoint(id)
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->replace_webhook_endpoint: #{e}"
end
```

#### Using the replace_webhook_endpoint_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> replace_webhook_endpoint_with_http_info(id)

```ruby
begin
  # Replace a webhook endpoint
  data, status_code, headers = api_instance.replace_webhook_endpoint_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->replace_webhook_endpoint_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **Integer** | Webhook endpoint ID. Ignored. The response is always HTTP 410. |  |

### Return type

nil (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## update_webhook_endpoint

> update_webhook_endpoint(id)

Update a webhook endpoint

Retired. Returns HTTP 410 with error code `gone`. The body is ignored.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::WebhooksApi.new
id = 56 # Integer | Webhook endpoint ID. Ignored. The response is always HTTP 410.

begin
  # Update a webhook endpoint
  api_instance.update_webhook_endpoint(id)
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->update_webhook_endpoint: #{e}"
end
```

#### Using the update_webhook_endpoint_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> update_webhook_endpoint_with_http_info(id)

```ruby
begin
  # Update a webhook endpoint
  data, status_code, headers = api_instance.update_webhook_endpoint_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue Weft::ApiError => e
  puts "Error when calling WebhooksApi->update_webhook_endpoint_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **Integer** | Webhook endpoint ID. Ignored. The response is always HTTP 410. |  |

### Return type

nil (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json
