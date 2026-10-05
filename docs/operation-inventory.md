# SDK operation inventory

The generated clients expose the complete OpenAPI contract. The buyer façades
expose the buyer runtime for applications and autonomous agents. Credential
lifecycle, seller, and organization-scoped operations stay on the lower-level
generated clients.

<!-- operation-inventory:start -->
| operation | TypeScript façade | Python façade | Ruby façade | Go façade | classification/reason |
| --- | --- | --- | --- | --- | --- |
| `getOpenApiDocument` | — | — | — | — | Excluded: contract discovery metadata |
| `createAccountBootstrap` | — | — | — | — | Excluded: CLI-only (weftlabs/weft-cli) |
| `getAccountBootstrap` | — | — | — | — | Excluded: CLI-only (weftlabs/weft-cli) |
| `cancelAccountBootstrap` | — | — | — | — | Excluded: credential cancellation and revocation |
| `enrollResource` | — | — | — | — | Excluded: seller resource enrollment |
| `signUp` | — | — | — | — | Excluded: interactive account lifecycle |
| `confirmAccount` | — | — | — | — | Excluded: interactive account lifecycle |
| `resendConfirmation` | — | — | — | — | Excluded: interactive account lifecycle |
| `signIn` | — | — | — | — | Excluded: CLI uses API keys or stored bootstrap credentials |
| `requestPasswordReset` | — | — | — | — | Excluded: interactive account lifecycle |
| `updatePassword` | — | — | — | — | Excluded: interactive account lifecycle |
| `getMe` | `me` | `me` | `me` | `Me` | Facade: Buyer runtime |
| `listApiKeys` | — | — | — | — | Excluded: credential lifecycle |
| `createApiKey` | — | — | — | — | Excluded: prevents secrets in CLI output/history |
| `revokeApiKey` | — | — | — | — | Excluded: credential lifecycle |
| `getBalance` | `balance` | `balance` | `balance` | `Balance` | Facade: Buyer runtime |
| `search` | `search` | `search` | `search` | `Search` | Facade: Buyer runtime |
| `fetch` | `fetch` | `fetch` | `fetch` | `Fetch` | Facade: Paid buyer runtime |
| `listPayments` | — | — | — | — | Excluded: organization-scoped seller ledger |
| `getPayment` | — | — | — | — | Excluded: organization-scoped seller ledger |
| `listPurchases` | `purchases` | `purchases` | `purchases` | `Purchases` | Facade: Buyer purchase ledger |
| `getPurchase` | `purchase` | `purchase` | `purchase` | `Purchase` | Facade: Buyer purchase detail |
<!-- operation-inventory:end -->

CLI commands, output envelopes, and exit codes: [weft-cli contract](https://github.com/weftlabs/weft-cli/blob/main/docs/contract.md).
