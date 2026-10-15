
# SearchCompactResult

One row of the compact agent view: the minimum contract for the next paid call, below 2,000 JSON bytes. It is the hosted MCP `weft_search` projection with REST references: `contract_url` replaces the MCP `weft_contract` call, and `next_call` is a `POST /api/v1/fetch` request instead of an MCP `weft_fetch` call. To stay in the budget, the row drops optional fields in a fixed order (optional inputs, helper docs, the example, the description, then summaries) and `contract_detail` says what is left out. In the last resort the row keeps the operation id, readiness states, the `weft_fetch` state, `contract_url` and the search id, and can lose the input names, the request recipe and price. The full contract at `contract_url` is always complete. The search id is the envelope `query_trace_id`; each row also carries it in `attribution` or in `next_call.body`.

## Properties

Name | Type
------------ | -------------
`provider` | [SearchCompactResultProvider](SearchCompactResultProvider.md)
`operation` | [SearchCompactResultOperation](SearchCompactResultOperation.md)
`inputs` | { [key: string]: any; }
`request` | { [key: string]: any; }
`example` | any
`access` | [SearchCompactAccess](SearchCompactAccess.md)
`attribution` | [SearchCompactResultAttribution](SearchCompactResultAttribution.md)
`output` | { [key: string]: any; }
`docs` | [SearchHelperDocs](SearchHelperDocs.md)
`contractUrl` | string
`contractDetail` | string
`completion` | string
`blockedScopes` | [Array&lt;SearchCompactResultBlockedScopesInner&gt;](SearchCompactResultBlockedScopesInner.md)
`contractGaps` | Array&lt;string&gt;
`readiness` | [{ [key: string]: SearchCompactResultBlockedScopesInner; }](SearchCompactResultBlockedScopesInner.md)
`nextCall` | [SearchCompactNextCall](SearchCompactNextCall.md)

## Example

```typescript
import type { SearchCompactResult } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "provider": null,
  "operation": null,
  "inputs": null,
  "request": null,
  "example": null,
  "access": null,
  "attribution": null,
  "output": null,
  "docs": null,
  "contractUrl": null,
  "contractDetail": null,
  "completion": null,
  "blockedScopes": null,
  "contractGaps": null,
  "readiness": null,
  "nextCall": null,
} satisfies SearchCompactResult

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchCompactResult
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
