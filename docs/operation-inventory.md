# SDK and CLI operation inventory

The generated clients expose the complete OpenAPI contract. `WeftClient` and
the separate `@weftlabs/cli` package intentionally expose the buyer runtime needed by applications
and autonomous agents; credential lifecycle, seller, and organization-scoped
operations stay on the lower-level generated clients.

<!-- operation-inventory:start -->
| operation | TypeScript façade | Python façade | CLI | classification/reason |
| --- | --- | --- | --- | --- |
| `getOpenApiDocument` | — | — | — | Excluded: contract discovery metadata |
| `createAccountBootstrap` | — | — | `weft bootstrap` | CLI-only: Credential bootstrap lifecycle |
| `getAccountBootstrap` | — | — | `weft auth status` | CLI-only: Credential bootstrap lifecycle |
| `cancelAccountBootstrap` | — | — | — | Excluded: credential cancellation and revocation |
| `enrollResource` | — | — | — | Excluded: seller resource enrollment |
| `signUp` | — | — | — | Excluded: interactive account lifecycle |
| `confirmAccount` | — | — | — | Excluded: interactive account lifecycle |
| `resendConfirmation` | — | — | — | Excluded: interactive account lifecycle |
| `signIn` | — | — | — | Excluded: CLI uses API keys or stored bootstrap credentials |
| `requestPasswordReset` | — | — | — | Excluded: interactive account lifecycle |
| `updatePassword` | — | — | — | Excluded: interactive account lifecycle |
| `getMe` | `me` | `me` | `weft me` | Facade: Buyer runtime |
| `listApiKeys` | — | — | — | Excluded: credential lifecycle |
| `createApiKey` | — | — | — | Excluded: prevents secrets in CLI output/history |
| `revokeApiKey` | — | — | — | Excluded: credential lifecycle |
| `getBalance` | `balance` | `balance` | `weft balance` | Facade: Buyer runtime |
| `search` | `search` | `search` | `weft search QUERY` | Facade: Buyer runtime |
| `fetch` | `fetch` | `fetch` | `weft fetch URL --max-cost-usd USD` | Facade: Paid buyer runtime |
| `listPayments` | — | — | — | Excluded: organization-scoped seller ledger |
| `getPayment` | — | — | — | Excluded: organization-scoped seller ledger |
| `listPurchases` | `purchases` | `purchases` | `weft purchases` | Facade: Buyer purchase ledger |
| `getPurchase` | `purchase` | `purchase` | `weft purchases ID` | Facade: Buyer purchase detail |
<!-- operation-inventory:end -->

## CLI contract

Authentication precedence is explicit `--api-key-stdin`, then `WEFT_API_KEY`,
then the protected local bootstrap or legacy OAuth credential store. A
`--api-key VALUE` argument is rejected so credentials do not leak into shell
history or process listings. Legacy stored OAuth credentials refresh before expiry.
The API origin defaults to `https://weft.network` and can be changed with
`WEFT_BASE_URL` or `--base-url`; stored credentials retain their API origin.

Every command prints one versioned JSON object. Most successes use
`{"schema_version":"1","ok":true,"command":"…","data":…}` on stdout.
Errors use
`{"schema_version":"1","ok":false,"command":"…","error":{"code":"…","message":"…","details":…}}`
on stderr. Fetch success also includes
`"meta":{"idempotency_key":"…"}` so an uncertain call can be retried with
the exact same key. Default `weft fetch` uses schema version `"2"` for results
and for errors after fetch option validation starts. Other commands and
`weft fetch --raw` retain schema version `"1"`.

Default fetch saves exact response bytes before stdout. Its `meta` object
precedes `data` and includes `saved_path`, `receipt_path`, `byte_count`, and
`idempotency_key`. Both paths are absolute. `data` retains the SDK's camelCase
receipt fields but replaces `bodyBase64` with `body_encoding`, `media_type`,
and, for valid UTF-8 text or JSON, the complete original `body` string. JSON
body values are not parsed or reformatted. Binary, compressed, and invalid
UTF-8 responses use `body_encoding: "file"` and omit `body`. Fetch with `--raw`
retains the original SDK result with `bodyBase64` and does not write files.

Local files use private per-result directories and are not deleted automatically.
`RESULT_STORAGE_UNAVAILABLE` means no fetch was sent. `RESULT_STORAGE_FAILED`
means the response arrived but local delivery failed; its error details keep
the body-free receipt and mark `file_complete: false`, while `meta` keeps the
retry key. Both use exit code `5`. See [CLI result storage](../cli/README.md#fetch-results)
for paths, permissions, cleanup, and retry instructions.
Invalid transport Base64 returns `RESULT_DECODE_FAILED`, with the receipt and
retry key. A failed stdout write returns `RESULT_OUTPUT_FAILED`, with the
receipt and any saved paths. Both use exit code `5`; reading a saved local file
requires no fetch or payment.

`weft --help` returns every command, global option, authentication method, and
exit code as JSON. `weft <command> --help` returns command-specific usage and
options. Help does not require authentication or make a network request.

Exit codes are stable:

- `0`: success
- `2`: invalid command, argument, or option
- `3`: missing authentication or an HTTP `401`/`403`
- `4`: other HTTP `4xx` API or policy rejection
- `5`: HTTP `5xx`, network, runtime, or unexpected internal failure

`weft fetch` always requires `--max-cost-usd`. It accepts
`--idempotency-key`; when omitted, the CLI generates a UUID for the
`Idempotency-Key` header.

`--max-results` is validated as `1..50`, and `--per-page` as `1..100`,
before a network request is made.

## Agent bootstrap

The package implements the bootstrap lifecycle. Read `weft --help` before
scripting it so the installed CLI remains the source of command syntax.

| Command | Purpose |
| --- | --- |
| `weft bootstrap --email EMAIL --agent-name NAME --reason TEXT` | Create a temporary bootstrap, email the human a claim link, store the `wbt_` credential in a mode-0600 local file |
| `weft auth status` | Report the bootstrap lifecycle state; poll at the interval returned by `weft bootstrap` |

The `wbt_` credential is secret. Before claim it is temporary for 30 minutes and
has exactly `search`, `status`, and `cancel`. Human approval promotes the same
bearer to durable `identity`, `search`, `balance`, `fetch`, `purchases`,
`status`, and `revoke` capabilities. It remains valid until revoked. Seller,
organization, API-key administration, dashboard-session, transfer, withdrawal,
and MCP surfaces always refuse it. Lifecycle states are `pending`, `claimed`,
`rejected`, `expired`, and `revoked`; the last three are terminal. Claimed
credentials retain search. Cancellation and revocation are API capabilities; no
CLI cancel or revoke command is shipped in this version.

New bootstrap flows make no OAuth registration or token request. Existing
stored OAuth credentials remain compatible and refresh before expiry.

Ask the human to verify the claim email. Weft applies the one-time signup grant
after verification; then check the balance. Do not ask for a wallet top-up
during onboarding.
