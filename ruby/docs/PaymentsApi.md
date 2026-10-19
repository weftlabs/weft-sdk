# Weft::PaymentsApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
| ------ | ------------ | ----------- |
| [**get_payment**](PaymentsApi.md#get_payment) | **GET** /api/v1/payments/{id} | Get payment details |
| [**list_payments**](PaymentsApi.md#list_payments) | **GET** /api/v1/payments | List payments |


## get_payment

> <PaymentResponse> get_payment(id)

Get payment details

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::PaymentsApi.new
id = 56 # Integer | Payment ID

begin
  # Get payment details
  result = api_instance.get_payment(id)
  p result
rescue Weft::ApiError => e
  puts "Error when calling PaymentsApi->get_payment: #{e}"
end
```

#### Using the get_payment_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<PaymentResponse>, Integer, Hash)> get_payment_with_http_info(id)

```ruby
begin
  # Get payment details
  data, status_code, headers = api_instance.get_payment_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <PaymentResponse>
rescue Weft::ApiError => e
  puts "Error when calling PaymentsApi->get_payment_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **Integer** | Payment ID |  |

### Return type

[**PaymentResponse**](PaymentResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_payments

> <PaymentListResponse> list_payments(opts)

List payments

Seller payment receipts for the authenticated organization. A resource key with `product_id` set returns only payments whose `product_id` is that product. A resource key with `product_id` nil returns the organization. A payment outside that scope is not found.

### Examples

```ruby
require 'time'
require 'weft-sdk'
# setup authorization
Weft.configure do |config|
  # Configure Bearer authorization (APIKey): bearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = Weft::PaymentsApi.new
opts = {
  page: 56, # Integer | Page number
  per_page: 56 # Integer | Items per page
}

begin
  # List payments
  result = api_instance.list_payments(opts)
  p result
rescue Weft::ApiError => e
  puts "Error when calling PaymentsApi->list_payments: #{e}"
end
```

#### Using the list_payments_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<PaymentListResponse>, Integer, Hash)> list_payments_with_http_info(opts)

```ruby
begin
  # List payments
  data, status_code, headers = api_instance.list_payments_with_http_info(opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <PaymentListResponse>
rescue Weft::ApiError => e
  puts "Error when calling PaymentsApi->list_payments_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **page** | **Integer** | Page number | [optional][default to 1] |
| **per_page** | **Integer** | Items per page | [optional][default to 25] |

### Return type

[**PaymentListResponse**](PaymentListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json
