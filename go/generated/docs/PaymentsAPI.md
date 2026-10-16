# \PaymentsAPI

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**GetPayment**](PaymentsAPI.md#GetPayment) | **Get** /api/v1/payments/{id} | Get payment details
[**ListPayments**](PaymentsAPI.md#ListPayments) | **Get** /api/v1/payments | List payments



## GetPayment

> PaymentResponse GetPayment(ctx, id).Execute()

Get payment details

### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/weftlabs/weft-sdk/go/generated"
)

func main() {
	id := int32(56) // int32 | Payment ID

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.PaymentsAPI.GetPayment(context.Background(), id).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PaymentsAPI.GetPayment``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetPayment`: PaymentResponse
	fmt.Fprintf(os.Stdout, "Response from `PaymentsAPI.GetPayment`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**id** | **int32** | Payment ID |

### Other Parameters

Other parameters are passed through a pointer to a apiGetPaymentRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**PaymentResponse**](PaymentResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ListPayments

> PaymentListResponse ListPayments(ctx).Page(page).PerPage(perPage).Execute()

List payments



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/weftlabs/weft-sdk/go/generated"
)

func main() {
	page := int32(56) // int32 | Page number (optional) (default to 1)
	perPage := int32(56) // int32 | Items per page (optional) (default to 25)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.PaymentsAPI.ListPayments(context.Background()).Page(page).PerPage(perPage).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PaymentsAPI.ListPayments``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `ListPayments`: PaymentListResponse
	fmt.Fprintf(os.Stdout, "Response from `PaymentsAPI.ListPayments`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiListPaymentsRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | **int32** | Page number | [default to 1]
 **perPage** | **int32** | Items per page | [default to 25]

### Return type

[**PaymentListResponse**](PaymentListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)
