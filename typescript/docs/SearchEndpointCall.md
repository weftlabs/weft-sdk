
# SearchEndpointCall

The machine-readable call contract for this endpoint: the verb, the provider-declared argument schema, and the worked examples. Always present; an endpoint whose provider declares nothing carries an empty `method` and null members rather than an absent block, so a caller can always read `input_schema` without a presence check. Combine with the hit\'s `url` to construct the request.

## Properties

Name | Type
------------ | -------------
`method` | string
`inputSchema` | [SearchEndpointCallInputSchema](SearchEndpointCallInputSchema.md)
`exampleRequest` | object
`exampleResponse` | any

## Example

```typescript
import type { SearchEndpointCall } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "method": null,
  "inputSchema": null,
  "exampleRequest": null,
  "exampleResponse": null,
} satisfies SearchEndpointCall

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchEndpointCall
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
