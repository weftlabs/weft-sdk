# SearchApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**search**](SearchApi.md#searchoperation) | **POST** /api/v1/search | Search the Weft index |



## search

> SearchResponse search(searchRequest)

Search the Weft index

Semantic search over the Weft index of paid agent resources. The request body is the weft-search-platform &#x60;/v1/search&#x60; contract: a free-text &#x60;query&#x60;, optional &#x60;max_results&#x60;, and optional structured &#x60;filters&#x60; (price / price_atomic / type / protocol — the canonical FilterSpec v1 vocabulary, vendored verbatim from the platform). Price is a dual representation of one constraint: &#x60;price&#x60; in USD decimal strings (the reasoning form) XOR &#x60;price_atomic&#x60; in integer micro-USD (the settlement form) — mutually exclusive, set at most one.  Account-scoped: the bearer token must be a buyer-scoped API key, an OAuth token carrying &#x60;search&#x60;, or a pending or claimed &#x60;wbt_*&#x60; bootstrap bearer. Pending bootstrap access uses an anonymous bootstrap identity; after claim, the promoted bearer uses its bound User. Rejection, cancellation, expiry, and revocation end bootstrap search. Bootstrap search is limited to 60 requests per credential and 120 per IP each hour before native credential promotion.  Response negotiation: &#x60;Accept: application/json&#x60; (default) returns the structured envelope; &#x60;Accept: text/markdown&#x60; returns a rendered Markdown digest of the same results — useful for piping into a chat UI or LLM prompt.  Compact view: send &#x60;view: \&quot;compact\&quot;&#x60; to get the agent view of the hosted MCP &#x60;weft_search&#x60; tool. Each result is a small contract for the next paid call (below 2,000 JSON bytes): typed inputs, the request recipe, one access method with price, attribution, a ready &#x60;next_call&#x60; to &#x60;POST /api/v1/fetch&#x60; when the request is determined, and the authenticated &#x60;contract_url&#x60; for the full contract. Use it when you give search results to a model. The compact rows are in &#x60;compact_results&#x60;; &#x60;results&#x60; is empty. The compact view is JSON only and needs the curated search backend.

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '@weftlabs/sdk';
import type { SearchOperationRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new SearchApi(config);

  const body = {
    // SearchRequest
    searchRequest: ...,
  } satisfies SearchOperationRequest;

  try {
    const data = await api.search(body);
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
| **searchRequest** | [SearchRequest](SearchRequest.md) |  | |

### Return type

[**SearchResponse**](SearchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`, `text/markdown`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Search results |  -  |
| **401** | Unauthorized — missing or non-buyer-scoped API key |  -  |
| **403** | The OAuth access token authenticated but lacks the &#x60;search&#x60; scope (RFC 6750 &#x60;insufficient_scope&#x60;). Carries a &#x60;WWW-Authenticate: Bearer error&#x3D;\&quot;insufficient_scope\&quot;, scope&#x3D;\&quot;search\&quot;&#x60; header. &#x60;wk_&#x60; API keys are unscoped and never see this.  |  -  |
| **406** | The requested response format is not JSON or Markdown. |  -  |
| **422** | Invalid request — empty/missing &#x60;query&#x60;, out-of-range &#x60;max_results&#x60;, an unknown top-level parameter, invalid &#x60;filters&#x60; (unknown filter key/operator, bad enum value, or a sub-filter without exactly one operator), or an invalid &#x60;view&#x60; (unknown value, &#x60;Accept: text/markdown&#x60;, or a backend without the compact view). See the &#x60;error&#x60; code.  |  -  |
| **429** | Bootstrap search rate limit exceeded |  -  |
| **502** | Search service unavailable |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
