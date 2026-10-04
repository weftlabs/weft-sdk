# \FetchAPI

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**Fetch**](FetchAPI.md#Fetch) | **Post** /api/v1/fetch | Pay-and-fetch any URL (x402/MPP proxy)



## Fetch

> FetchResponse Fetch(ctx).FetchRequest(fetchRequest).IdempotencyKey(idempotencyKey).Execute()

Pay-and-fetch any URL (x402/MPP proxy)



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
	fetchRequest := *openapiclient.NewFetchRequest("https://x402.api.agentmail.to/v0/inboxes") // FetchRequest |
	idempotencyKey := "idempotencyKey_example" // string | Opaque caller-generated retry key. Reusing the same key for the same buyer converges on one paid fetch; keys are hashed and namespaced by buyer before storage. Send this header for every unattended or retryable paid request. Effective safety controls participate in retry identity. Changing them under a reserved key returns `IDEMPOTENCY_CONFLICT`; an older unconstrained payment cannot become a bounded success on retry.  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.FetchAPI.Fetch(context.Background()).FetchRequest(fetchRequest).IdempotencyKey(idempotencyKey).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `FetchAPI.Fetch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `Fetch`: FetchResponse
	fmt.Fprintf(os.Stdout, "Response from `FetchAPI.Fetch`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiFetchRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **fetchRequest** | [**FetchRequest**](FetchRequest.md) |  |
 **idempotencyKey** | **string** | Opaque caller-generated retry key. Reusing the same key for the same buyer converges on one paid fetch; keys are hashed and namespaced by buyer before storage. Send this header for every unattended or retryable paid request. Effective safety controls participate in retry identity. Changing them under a reserved key returns &#x60;IDEMPOTENCY_CONFLICT&#x60;; an older unconstrained payment cannot become a bounded success on retry.  |

### Return type

[**FetchResponse**](FetchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)
