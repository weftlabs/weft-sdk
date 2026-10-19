
# SearchCompactNextCall

A ready paid call, present when the request is determined and the Weft fetch runtime can pay the access method. Replace each `{name}` listed in `fill` in `body` (and add `max_cost_usd` or `body` when they are listed), then send `body` as the JSON body of `POST /api/v1/fetch` with an `Idempotency-Key` header. `body` uses the wire field names (`max_cost_usd`, `search_id`); an SDK fetch call may name them differently, so map each field and keep the attribution fields.

## Properties

Name | Type
------------ | -------------
`method` | string
`path` | string
`body` | { [key: string]: any; }
`fill` | Array&lt;string&gt;

## Example

```typescript
import type { SearchCompactNextCall } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "method": null,
  "path": null,
  "body": null,
  "fill": null,
} satisfies SearchCompactNextCall

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchCompactNextCall
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
