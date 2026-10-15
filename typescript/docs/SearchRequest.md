
# SearchRequest


## Properties

Name | Type
------------ | -------------
`query` | string
`maxResults` | number
`filters` | [SearchFilterSpec](SearchFilterSpec.md)
`view` | string

## Example

```typescript
import type { SearchRequest } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "query": send email from an agent,
  "maxResults": null,
  "filters": null,
  "view": null,
} satisfies SearchRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
