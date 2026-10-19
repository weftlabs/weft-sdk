
# SearchCompactResultAttribution

Labels to send with the paid fetch so the purchase links to this search. Left out when `next_call.body` already carries them.

## Properties

Name | Type
------------ | -------------
`searchId` | string
`operationId` | string
`accessMethodId` | string

## Example

```typescript
import type { SearchCompactResultAttribution } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "searchId": null,
  "operationId": null,
  "accessMethodId": null,
} satisfies SearchCompactResultAttribution

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchCompactResultAttribution
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
