
# SearchHelperDocs

Free helper links for the upstream provider. GET these URLs. Do not send them through `weft_fetch`.

## Properties

Name | Type
------------ | -------------
`website` | string
`homepage` | string
`api` | string
`llmsTxt` | string

## Example

```typescript
import type { SearchHelperDocs } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "website": null,
  "homepage": null,
  "api": null,
  "llmsTxt": null,
} satisfies SearchHelperDocs

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchHelperDocs
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
