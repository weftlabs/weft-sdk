# FetchApi

All URIs are relative to *https://weft.network*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**fetch**](FetchApi.md#fetchoperation) | **POST** /api/v1/fetch | Pay-and-fetch any URL (x402/MPP proxy) |



## fetch

> FetchResponse fetch(fetchRequest, idempotencyKey)

Pay-and-fetch any URL (x402/MPP proxy)

Universal x402/MPP fetch proxy. The caller provides a target &#x60;url&#x60;, a hard &#x60;max_cost_usd&#x60; ceiling, and optional &#x60;method&#x60; / &#x60;body&#x60; / &#x60;headers&#x60;. Weft:    1. Issues the request.   2. On &#x60;402 Payment Required&#x60;, selects a supported x402 or MPP challenge.   3. Compares the asking price to &#x60;max_cost_usd&#x60; and the      buyer\&#39;s policy (&#x60;max_tx_usd&#x60;, daily/weekly limits).   4. If an eligible mainnet MPP challenge finds its Tempo token short,      creates or adopts a buyer-owned Base-to-Tempo refill and returns      &#x60;409 FUNDING_PENDING&#x60; with &#x60;details.reason&#x3D;funding_active&#x60;. If an      overlapping payment invalidates the balance observation before a      bridge is created, the same retryable response carries      &#x60;details.reason&#x3D;balance_changed&#x60;. The caller retries the identical      fetch after &#x60;details.retry_after_seconds&#x60;; that later request      obtains a fresh challenge and reruns rail selection and all payment      controls.   5. Authorizes payment from the buyer\&#39;s wallet on the selected rail.   6. Replays the request with the protocol-specific payment credential.   7. Streams the upstream artifact back, base64-encoded under       &#x60;body_base64&#x60;, with &#x60;paid_usd&#x60;, &#x60;held_usd&#x60;, &#x60;payment_status&#x60;,       &#x60;tx_hash&#x60;, and &#x60;protocol&#x60;. &#x60;paid_usd&#x60;      is \&quot;0.00\&quot; until the charge is CONFIRMED settled — a signed-but-      unsettled hold (the common case for x402, which settles      asynchronously) reports its amount in &#x60;held_usd&#x60; instead, never      in &#x60;paid_usd&#x60;.  Errors are structured with a stable &#x60;error&#x60; code, and each error response carries the buyer\&#39;s &#x60;policy&#x60;, &#x60;balance&#x60;, and a &#x60;dashboard_url&#x60; so a CLI can render an actionable message without a second round-trip.  Account-scoped: the bearer must be a buyer-scoped API key, an OAuth access token carrying &#x60;fetch&#x60;, or a claimed &#x60;wbt_*&#x60; bearer.  **Forwarded headers:** the caller\&#39;s &#x60;headers&#x60; are passed through to the upstream, except a denylist of hop-by-hop and Weft-internal headers (&#x60;host&#x60;, &#x60;authorization&#x60;, &#x60;cookie&#x60;, &#x60;proxy-authorization&#x60;, &#x60;x-forwarded-*&#x60;, &#x60;x-real-ip&#x60;, &#x60;x-payment&#x60;, &#x60;connection&#x60;, &#x60;upgrade&#x60;). Up to 32 headers, 4 KB of combined value bytes.

### Example

```ts
import {
  Configuration,
  FetchApi,
} from '@weftlabs/sdk';
import type { FetchOperationRequest } from '@weftlabs/sdk';

async function example() {
  console.log("🚀 Testing @weftlabs/sdk SDK...");
  const config = new Configuration({
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new FetchApi(config);

  const body = {
    // FetchRequest
    fetchRequest: ...,
    // string | Opaque caller-generated retry key. Reusing the same key for the same buyer converges on one paid fetch; keys are hashed and namespaced by buyer before storage. Send this header for every unattended or retryable paid request.  (optional)
    idempotencyKey: idempotencyKey_example,
  } satisfies FetchOperationRequest;

  try {
    const data = await api.fetch(body);
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
| **fetchRequest** | [FetchRequest](FetchRequest.md) |  | |
| **idempotencyKey** | `string` | Opaque caller-generated retry key. Reusing the same key for the same buyer converges on one paid fetch; keys are hashed and namespaced by buyer before storage. Send this header for every unattended or retryable paid request.  | [Optional] [Defaults to `undefined`] |

### Return type

[**FetchResponse**](FetchResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Paid fetch succeeded; artifact streamed back base64-encoded. |  -  |
| **401** | Unauthorized — missing or non-buyer-scoped API key |  -  |
| **402** | Payment refused. &#x60;EXCEEDED_MAX_COST&#x60; (over the caller cap) or &#x60;INSUFFICIENT_BALANCE&#x60; (the buyer is genuinely short — &#x60;details.asset&#x60;, when present, names the exact token the failed check read). Both use &#x60;FetchErrorResponse&#x60;.  |  -  |
| **403** | Policy violation, missing Crossmint payment permission (&#x60;PAYMENT_AUTHORIZATION_REQUIRED&#x60; — &#x60;details&#x60; carries the wallet-page URL where the authenticated user can enable payments), denylisted recipient, or a merchant challenge on a chain outside the wallet\&#39;s own environment — a testnet wallet may not pay a mainnet challenge, nor the reverse (&#x60;WALLET_ENVIRONMENT_MISMATCH&#x60;; terminal, not retryable). All four use &#x60;FetchErrorResponse&#x60;. Alternatively an OAuth access token lacking the &#x60;fetch&#x60; scope (&#x60;InsufficientScopeResponse&#x60;, RFC 6750 &#x60;insufficient_scope&#x60;, with a &#x60;WWW-Authenticate&#x60; challenge). The two envelopes are disjoint; branch on the &#x60;error&#x60; value.  |  -  |
| **409** | &#x60;IDEMPOTENCY_CONFLICT&#x60; — this buyer already used the supplied &#x60;Idempotency-Key&#x60; for a different fetch request. Generate a new key for the new operation; retry the original operation unchanged.  Or &#x60;WALLET_SETUP_INCOMPLETE&#x60; — the buyer\&#39;s wallet has not been created yet, so there is nothing to pay from. &#x60;details.wallet_url&#x60; carries the page where the authenticated user finishes setup. No retry succeeds until they do.  Or &#x60;ACCOUNT_CLOSING&#x60; — account closure has started, so the wallet cannot reserve a new payment.  Or &#x60;FUNDING_PENDING&#x60; — retry after &#x60;details.retry_after_seconds&#x60;. &#x60;details.reason&#x60; is &#x60;funding_active&#x60; when a buyer-owned Base-to-Tempo refill exists, or &#x60;balance_changed&#x60; when an overlapping payment invalidated the balance observation before funding could start.  Or &#x60;DELIVERY_REPLAY_UNAVAILABLE&#x60; — the merchant already returned a successful response for this settled MPP payment, but Weft could not persist its bytes for replay. The merchant is not called again; &#x60;details.tx_hash&#x60; identifies the settled payment. All five use &#x60;FetchErrorResponse&#x60;.  |  -  |
| **413** | Upstream artifact exceeded the proxy\&#39;s size cap. |  -  |
| **422** | Invalid request fields, method, cost, body, headers, idempotency key, or URL. &#x60;UNSUPPORTED_ASSET&#x60; means the merchant requested an asset this wallet cannot settle. &#x60;UNSUPPORTED_PAYMENT_METHOD&#x60; means the MPP challenge requested a method Weft cannot execute.  |  -  |
| **424** | &#x60;MERCHANT_RETURNED_NON_402&#x60; — the upstream merchant is at fault: it did not return a 402, or its 402 challenge was invalid. A 4xx (not 5xx) because Weft behaved correctly and the caller should act on &#x60;details.reason&#x60; (e.g. pick another merchant); it also keeps the error envelope intact through CDNs that replace 5xx bodies.  &#x60;PAID_DELIVERY_FAILED&#x60; — the MPP payment settled, but the merchant did not deliver a successful response. &#x60;details.tx_hash&#x60; identifies the settled payment; &#x60;details.merchant_status&#x60; is present when the merchant returned an HTTP response.  |  -  |
| **502** | Settlement signing failed on Weft\&#39;s side (&#x60;SETTLEMENT_FAILED&#x60;). &#x60;details.reason&#x60; carries a stable payment sentence. &#x60;details.protocol&#x60; names a direct payment rail when that is safe and useful. It is absent for automatic-funding failures so provider, bridge, and retry details stay internal.  |  -  |
| **504** | &#x60;MERCHANT_TIMEOUT&#x60; — the upstream merchant did not complete the challenge or paid request inside Weft\&#39;s transport budget. &#x60;details.phase&#x60; names the request. When it is &#x60;paid&#x60;, &#x60;details.payment_may_have_moved&#x60; is true because the credential was already sent. Retry the identical operation with the same &#x60;Idempotency-Key&#x60;.  &#x60;SETTLEMENT_PENDING&#x60; — the payment was submitted and the wallet provider had not reached a terminal state before Weft\&#39;s polling budget ran out. NOTHING is known to have failed: the charge may already have settled, so this is not &#x60;SETTLEMENT_FAILED&#x60; and the amount is not lost. &#x60;details.retry_with_same_idempotency_key&#x60; is &#x60;true&#x60;.  Retry the identical request shortly. Sending the same &#x60;Idempotency-Key&#x60; resumes the same provider operation; a caller that sends no key is also safe, because Weft resumes its own in-flight operation for the same merchant, amount and network rather than opening a second one. Either way the retry resolves the original payment instead of charging twice.  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
