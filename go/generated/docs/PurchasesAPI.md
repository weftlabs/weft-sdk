# \PurchasesAPI

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**GetPurchase**](PurchasesAPI.md#GetPurchase) | **Get** /api/v1/purchases/{id} | Get a buyer purchase
[**ListPurchases**](PurchasesAPI.md#ListPurchases) | **Get** /api/v1/purchases | List buyer purchases



## GetPurchase

> PurchaseResponse GetPurchase(ctx, id).Execute()

Get a buyer purchase

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
	id := openapiclient.getPurchase_id_parameter{Int32: new(int32)} // GetPurchaseIdParameter | The opaque `purchase_id` (`pur_…`) that fetch returns, or the legacy integer `id`. Both resolve only within the caller's own purchases. New callers should store and send `purchase_id`.

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.PurchasesAPI.GetPurchase(context.Background(), id).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PurchasesAPI.GetPurchase``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetPurchase`: PurchaseResponse
	fmt.Fprintf(os.Stdout, "Response from `PurchasesAPI.GetPurchase`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**id** | [**GetPurchaseIdParameter**](.md) | The opaque &#x60;purchase_id&#x60; (&#x60;pur_…&#x60;) that fetch returns, or the legacy integer &#x60;id&#x60;. Both resolve only within the caller&#39;s own purchases. New callers should store and send &#x60;purchase_id&#x60;.  |

### Other Parameters

Other parameters are passed through a pointer to a apiGetPurchaseRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**PurchaseResponse**](PurchaseResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ListPurchases

> PurchaseListResponse ListPurchases(ctx).Page(page).PerPage(perPage).Execute()

List buyer purchases



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
	resp, r, err := apiClient.PurchasesAPI.ListPurchases(context.Background()).Page(page).PerPage(perPage).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `PurchasesAPI.ListPurchases``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `ListPurchases`: PurchaseListResponse
	fmt.Fprintf(os.Stdout, "Response from `PurchasesAPI.ListPurchases`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiListPurchasesRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | **int32** | Page number | [default to 1]
 **perPage** | **int32** | Items per page | [default to 25]

### Return type

[**PurchaseListResponse**](PurchaseListResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)
