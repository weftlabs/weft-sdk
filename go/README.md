# weft-sdk (Go)

Unified Weft SDK for the Weft API and x402 Facilitator.

## Install

```bash
go get github.com/weftlabs/weft-sdk/go
```

## Seller middleware

Routes are a slice. The first declared match wins. A duplicate pattern is an error.

```go
middleware, err := facilitator.PaymentMiddleware([]facilitator.Route{
    {Pattern: "/api/*", Config: facilitator.RouteConfig{Accepts: map[string]any{
        "scheme": "exact", "network": "eip155:84532", "payTo": "0x1", "price": "$0.01",
    }}},
    {Pattern: "/api/premium", Config: facilitator.RouteConfig{Accepts: map[string]any{
        "scheme": "exact", "network": "eip155:84532", "payTo": "0x1", "price": "$1.00",
    }}},
}, facilitator.MiddlewareConfig{
    Facilitator: &facilitator.Config{URL: "https://x402.weft.network"},
})
```
