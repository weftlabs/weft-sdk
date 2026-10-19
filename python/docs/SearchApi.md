# weft_sdk.generated.SearchApi

All URIs are relative to *https://weft.network*

Method | HTTP request | Description
------------- | ------------- | -------------
[**search**](SearchApi.md#search) | **POST** /api/v1/search | Search the Weft index


# **search**
> SearchResponse search(search_request)

Search the Weft index

Semantic search over the Weft index of paid agent resources. The
request body is the weft-search-platform `/v1/search` contract:
a free-text `query`, optional `max_results`, and optional structured
`filters` (price / price_atomic / type / protocol — the canonical
FilterSpec v1 vocabulary, vendored verbatim from the platform). Price is
a dual representation of one constraint: `price` in USD decimal strings
(the reasoning form) XOR `price_atomic` in integer micro-USD (the
settlement form) — mutually exclusive, set at most one.

Account-scoped: the bearer token must be a buyer-scoped API key, an
OAuth token carrying `search`, or a pending or claimed `wbt_*` bootstrap
bearer. Pending bootstrap access uses an anonymous bootstrap identity;
after claim, the promoted bearer uses its bound User. Rejection,
cancellation, expiry, and revocation end bootstrap search. Bootstrap
search is limited to 60 requests per credential and 120 per IP each
hour before native credential promotion.

Response negotiation: `Accept: application/json` (default) returns
the structured envelope; `Accept: text/markdown` returns a rendered
Markdown digest of the same results — useful for piping into a chat
UI or LLM prompt.

Compact view: send `view: "compact"` to get the agent view of the
hosted MCP `weft_search` tool. Each result is a small contract for the
next paid call (below 2,000 JSON bytes): typed inputs, the request
recipe, one access method with price, attribution, a ready `next_call`
to `POST /api/v1/fetch` when the request is determined, and the
authenticated `contract_url` for the full contract. Use it when you
give search results to a model. The compact rows are in
`compact_results`; `results` is empty. The compact view is JSON only
and needs the curated search backend.


### Example

* Bearer (APIKey) Authentication (bearerAuth):

```python
import weft_sdk.generated
from weft_sdk.generated.models.search_request import SearchRequest
from weft_sdk.generated.models.search_response import SearchResponse
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
    api_instance = weft_sdk.generated.SearchApi(api_client)
    search_request = weft_sdk.generated.SearchRequest() # SearchRequest |

    try:
        # Search the Weft index
        api_response = api_instance.search(search_request)
        print("The response of SearchApi->search:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SearchApi->search: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **search_request** | [**SearchRequest**](SearchRequest.md)|  |

### Return type

[**SearchResponse**](SearchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json, text/markdown

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Search results |  -  |
**401** | Unauthorized — missing or non-buyer-scoped API key |  -  |
**403** | The OAuth access token authenticated but lacks the &#x60;search&#x60; scope (RFC 6750 &#x60;insufficient_scope&#x60;). Carries a &#x60;WWW-Authenticate: Bearer error&#x3D;\&quot;insufficient_scope\&quot;, scope&#x3D;\&quot;search\&quot;&#x60; header. &#x60;wk_&#x60; API keys are unscoped and never see this.  |  -  |
**406** | The requested response format is not JSON or Markdown. |  -  |
**422** | Invalid request — empty/missing &#x60;query&#x60;, out-of-range &#x60;max_results&#x60;, an unknown top-level parameter, invalid &#x60;filters&#x60; (unknown filter key/operator, bad enum value, or a sub-filter without exactly one operator), or an invalid &#x60;view&#x60; (unknown value, &#x60;Accept: text/markdown&#x60;, or a backend without the compact view). See the &#x60;error&#x60; code.  |  -  |
**429** | Bootstrap search rate limit exceeded |  -  |
**502** | Search service unavailable |  -  |
**500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
