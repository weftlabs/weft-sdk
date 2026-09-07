
# FetchResponse

Successful fetch envelope. `body_base64` is the upstream artifact bytes, base64-encoded. `paid_usd`, `held_usd`, `payment_status`, `tx_hash`, and `protocol` describe the payment and settlement state.  `paid_usd` is \"0.00\" (never the nominal charge amount) until the charge is CONFIRMED settled on-chain — a signed-but-unsettled hold reports its amount in `held_usd` instead. This is a deliberate honesty fix: earlier versions of this endpoint returned the nominal amount in `paid_usd` unconditionally, even when the charge never settled.  **Money string format.** Every USD amount on this surface is exact to the micro-dollar and never narrower than two decimals: a whole-cent amount renders \"0.50\", a sub-cent amount keeps its real precision (\"0.000892\"), and zero renders \"0.00\". Amounts are never rounded — an agent reconciling its own spend reads the truth, not a display value. Parse these as decimals; do NOT compare them as strings against a bare zero literal.

## Properties

Name | Type
------------ | -------------
`status` | number
`headers` | { [key: string]: string; }
`bodyBase64` | string
`paidUsd` | string
`heldUsd` | string
`paymentStatus` | string
`txHash` | string
`protocol` | string
`artifactId` | number

## Example

```typescript
import type { FetchResponse } from '@weftlabs/sdk'

// TODO: Update the object below with actual values
const example = {
  "status": 200,
  "headers": null,
  "bodyBase64": null,
  "paidUsd": 0.002,
  "heldUsd": 0.002,
  "paymentStatus": pending,
  "txHash": null,
  "protocol": null,
  "artifactId": null,
} satisfies FetchResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FetchResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)
