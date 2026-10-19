
# Purchase


## Properties

Name | Type
------------ | -------------
`id` | number
`purchaseId` | string
`status` | string
`amountUsd` | string
`recipientAddress` | string
`network` | string
`protocol` | string
`context` | string
`searchId` | string
`attributionStatus` | string
`txHash` | string
`rejectReason` | string
`failureReason` | string
`idempotencyKey` | string
`signedAt` | Date
`settledAt` | Date
`artifact` | [PurchaseArtifact](PurchaseArtifact.md)

## Example

```typescript
import type { Purchase } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "purchaseId": pur_4V3n9mQ0b7XyK2sLpR8tWc1d,
  "status": null,
  "amountUsd": null,
  "recipientAddress": null,
  "network": null,
  "protocol": null,
  "context": null,
  "searchId": null,
  "attributionStatus": null,
  "txHash": null,
  "rejectReason": null,
  "failureReason": null,
  "idempotencyKey": null,
  "signedAt": null,
  "settledAt": null,
  "artifact": null,
} satisfies Purchase

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Purchase
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
