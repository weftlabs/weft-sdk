
# SearchResponse

The weft-search-platform `POST /v1/search` response envelope.

## Properties

Name | Type
------------ | -------------
`queryTraceId` | string
`query` | string
`format` | string
`markdown` | string
`resultCount` | number
`servedFrom` | string
`asOf` | Date
`stale` | boolean
`paymentNote` | string
`appliedFilters` | [SearchFilterSpec](SearchFilterSpec.md)
`decompositionSource` | string
`embedderModel` | string
`candidatesConsidered` | number
`warnings` | [Array&lt;SearchResponseWarningsInner&gt;](SearchResponseWarningsInner.md)
`matchQuality` | string
`reason` | string
`suggestion` | string
`results` | [Array&lt;SearchResult&gt;](SearchResult.md)
`view` | string
`compactResults` | [Array&lt;SearchCompactResult&gt;](SearchCompactResult.md)
`omittedResults` | number

## Example

```typescript
import type { SearchResponse } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "queryTraceId": null,
  "query": null,
  "format": null,
  "markdown": null,
  "resultCount": null,
  "servedFrom": null,
  "asOf": null,
  "stale": null,
  "paymentNote": null,
  "appliedFilters": null,
  "decompositionSource": null,
  "embedderModel": null,
  "candidatesConsidered": null,
  "warnings": null,
  "matchQuality": null,
  "reason": null,
  "suggestion": null,
  "results": null,
  "view": null,
  "compactResults": null,
  "omittedResults": null,
} satisfies SearchResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
