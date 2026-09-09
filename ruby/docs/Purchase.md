# Weft::Purchase

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **Integer** |  |  |
| **status** | **String** |  |  |
| **amount_usd** | **String** | Exact decimal USD amount with up to six fractional digits. Settled rows report the amount that moved; pending and failed rows report their authorization amount. |  |
| **recipient_address** | **String** |  |  |
| **network** | **String** |  |  |
| **protocol** | **String** |  |  |
| **context** | **String** |  |  |
| **search_id** | **String** | Search trace ID used to attribute this purchase, when available. |  |
| **attribution_status** | **String** |  |  |
| **tx_hash** | **String** |  |  |
| **reject_reason** | **String** |  |  |
| **failure_reason** | **String** |  |  |
| **idempotency_key** | **String** |  |  |
| **signed_at** | **Time** |  |  |
| **settled_at** | **Time** |  |  |
| **artifact** | [**PurchaseArtifact**](PurchaseArtifact.md) |  |  |

## Example

```ruby
require 'weft-sdk'

instance = Weft::Purchase.new(
  id: null,
  status: null,
  amount_usd: null,
  recipient_address: null,
  network: null,
  protocol: null,
  context: null,
  search_id: null,
  attribution_status: null,
  tx_hash: null,
  reject_reason: null,
  failure_reason: null,
  idempotency_key: null,
  signed_at: null,
  settled_at: null,
  artifact: null
)
```
