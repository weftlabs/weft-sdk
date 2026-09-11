# Weft CLI

Use Weft from a shell or an autonomous agent. Application code should use the
separate [`@weftlabs/sdk`](../typescript/README.md) package. The human-oriented
CLI guide is at [weftlabs.com/x402/cli](https://weftlabs.com/x402/cli).

The CLI prints one versioned JSON object per command. It accepts credentials
through `--api-key-stdin`, `WEFT_API_KEY`, or its protected local credential
store; it rejects API keys in command arguments so they do not leak into shell
history or process listings.
`weft --help` and `weft <command> --help` return machine-readable JSON without
requiring authentication.

## With a buyer API key

```sh
export WEFT_API_KEY="your-buyer-api-key"
npx --package @weftlabs/cli weft me
npx --package @weftlabs/cli weft search "weather data API"
npx --package @weftlabs/cli weft fetch "https://merchant.example/data" \
  --max-cost-usd 0.05
npx --package @weftlabs/cli weft --help
```

## Fetch results

One `weft fetch` call saves the exact response bytes before it prints its JSON
result. The default fetch output uses `schema_version: "2"`. The `meta` object
comes before the body and contains `saved_path` (an absolute path), `byte_count`,
`receipt_path`, and `idempotency_key`. The `data` object retains the SDK receipt
fields, including `status`, `headers`, `paidUsd`, `heldUsd`, `paymentStatus`, and
`artifactId`.

For text and JSON with valid UTF-8, `data.body` contains the complete original
text and `data.body_encoding` is `"utf-8"`. JSON is kept as text, so number
precision, duplicate keys, whitespace, and a UTF-8 BOM are preserved. The body
is escaped as a string in the outer JSON object. `data.media_type` identifies
its media type. Binary, compressed, invalid UTF-8, and other non-text responses
use `data.body_encoding: "file"` and omit `body`. Read `meta.saved_path` to use
those bytes. Reading the local file does not make a request or spend money.

Results are saved under `$HOME/.weft-results/result-<random>/` by default
(`USERPROFILE` or the operating system home is used when `HOME` is absent).
Set `WEFT_RESULTS_DIR` to use another storage directory. On Unix, that directory
must belong to your user and must not be writable by another user. The storage
path itself must not be a symlink. Each result directory has mode `0700`; its
`body` and `receipt.json` files have mode `0600`. The receipt file contains
metadata and the retry key, with no copy of the response body. Upstream filenames
do not determine the local path. Payloads are never made executable.

The CLI never deletes saved results. Remove individual result directories when
you no longer need them. A failed call can leave an empty directory or a partial
file. Do not use a file from a failed delivery as a complete result.

If the CLI cannot reserve a directory, it returns
`RESULT_STORAGE_UNAVAILABLE` before it sends the fetch. If storage fails after
fetch, it returns `RESULT_STORAGE_FAILED` on stderr with exit code `5`, the
receipt, and the same retry key. This is a local delivery failure; the receipt
still describes the payment state. Fix storage and retry the same URL, method,
and cost limit with `--idempotency-key` set to that key. The CLI does not retry
or purchase again automatically. Keep the same key after any uncertain result;
the server's existing retry rules and expiry still apply.

Invalid Base64 from the API returns `RESULT_DECODE_FAILED` with the receipt and
retry key; the CLI does not claim that damaged bytes were delivered. If stdout
fails, for example because a pipe closes, `RESULT_OUTPUT_FAILED` on stderr keeps
the receipt and saved paths. Read the saved file to recover without another
fetch. These delivery errors use exit code `5`.

Existing scripts can select `weft fetch ... --raw`. This retains the version 1
SDK envelope with `data.bodyBase64` and does not save local files. Other commands
retain their version 1 output. There is one fetch operation for every body size.
Hosts can still limit the text shown to a model; use the saved path when stdout
is clipped.

## Retrieve a wallet-protected result

After a paid submission, use the provider's result URL with the same Weft buyer
credential. For providers that support x402 Sign-In-With-X (SIWX), request HTTPS
GET with a zero spending ceiling:

```sh
weft fetch "https://merchant.example/runs/your-run-id" \
  --method GET --max-cost-usd 0
```

Weft obtains a fresh challenge and signs it with the buyer wallet used for
payment. The provider must support smart-wallet signatures and issue a valid
challenge for that exact resource. Retrieval does not fall back to payment.
A successful response has `paymentStatus: "not_required"`, `paidUsd: "0.00"`,
null `heldUsd` and `txHash`, and an `artifactId`. The CLI saves its body and
receipt as described above.

Repeat this GET to poll the job until the provider's documented terminal state.
Each call reads fresh provider state, even with the same idempotency key. Do not
repeat the paid submission to check job status. An unsafe or rejected challenge
returns `SIWX_RETRIEVAL_FAILED`; increasing the spending ceiling is not a remedy.

## With no credential: agent bootstrap and human claim

An agent that has no Weft credential can start by itself. The flow needs the
human's email address and nothing else. After the human verifies the claim
email, Weft applies the one-time signup grant. Check the balance after claim;
do not ask for a wallet top-up during onboarding.

```sh
npm install -g @weftlabs/cli

# 1. Ask the human for an email address. Never ask for a password.
# 2. Create the temporary bootstrap and send the claim email.
weft bootstrap --email "human@example.com" \
  --agent-name "Research agent" \
  --reason "Find weather data"

# 3. Search immediately, before the human does anything.
weft search "weather data API"

# 4. Ask the human to verify the claim email so Weft can apply the one-time
#    signup grant, then approve the agent.
# 5. Poll at the interval the bootstrap response returned.
weft auth status

# 6. Auth status reports claimed. The same bearer is now durable until revoked.
weft me

# 7. The claim is verified and the signup grant is applied. Check the balance;
#    do not ask for a wallet top-up during onboarding.
weft balance
```

### The `weft` Skill

Installing the package does not write to the machine. Install the `weft` Skill
(`SKILL.md` plus `rules/cli.md`, vendored from
[weftlabs/skills](https://github.com/weftlabs/skills)) with:

```bash
weft skill install
```

Any ordinary command installs it too, so an agent that runs `weft search`
before anyone reads this section still gets the Skill. Both paths are the same
idempotent operation, and running either again is safe.

Install one optional Weft workflow Skill for a specific agent host with:

```bash
weft skill install weft-flights-search --agent codex
```

Add `--global` to install it for all projects for that host. Named workflow
installs do not need Weft authentication. They delegate to the public Skills
CLI and keep its installation layout and host support.

Earlier versions installed the Skill from an `npm` package hook. That hook was
removed: `pnpm` and `bun` block dependency scripts by default, and `pnpm`
replays a cached package without re-running them, so the hook could be skipped
with no error and no Skill. Running it from the CLI removes that whole class of
silent failure, and it also picks up an agent host installed after the CLI —
the hook only ever ran once, at package install time.

The installer writes only for supported agent hosts already present on the
machine. It does not create configuration for absent hosts or replace a
different existing Skill. If an earlier version of this package installed the
retired `weft-cli` Skill, the installer removes that copy after the `weft`
Skill is in place; a hand-edited or user-owned `weft-cli` copy stays
untouched. Restart the agent host after the first install. Set
`WEFT_SKIP_SKILL_INSTALL=1` to opt out of both paths. Removing the package
leaves the Skill in place; remove the host's `skills/weft` directory if you
also want to remove the Skill.

`weft bootstrap` creates the bootstrap and writes the `wbt_` credential to a
local credential file created with mode `0600`. The response contains the
bootstrap capabilities and approval data. `weft auth status` updates those
fields after the server promotes the same bearer. It never requests an OAuth
exchange token, and normal output never prints secrets.

### The `wbt_` credential

- **Secret.** Never print, log, paste, commit, or email it. The CLI stores it
  for you.
- **Temporary before claim.** Its search-only claim window expires after 30
  minutes. Pre-claim capabilities are exactly `search`, `status`, and `cancel`.
- **Durable after claim.** Human approval promotes the same bearer to exactly
  `identity`, `search`, `balance`, `fetch`, `purchases`, `status`, and `revoke`.
  It has no post-claim expiry and remains valid until the human disconnects it.
- **Always refused elsewhere.** Seller, organization, API-key administration,
  dashboard-session, transfer, withdrawal, and MCP surfaces reject it before
  and after claim.

The human's password is never part of this flow. The agent does not choose,
receive, or store it. An existing user completes fresh authentication on the
claim page; possession of the email link alone cannot attach an agent to an
existing account.

### Bootstrap states

| Status | Meaning | Agent action |
| --- | --- | --- |
| `pending` | Waiting for the human. Search works. | Poll at the returned interval. |
| `claimed` | The human approved. The same bearer is durable with the fixed post-claim capabilities. | Continue with normal commands. |
| `rejected` | The human declined. Terminal. | Stop and start a new bootstrap. |
| `expired` | The 30-minute window closed unclaimed. Terminal. | Start a new bootstrap. |
| `revoked` | The human disconnected the credential. Terminal; all later authentication fails. | Start a new bootstrap only if the human requests it. |

`weft auth status` returns `claimed` after approval and keeps the same bearer.
It does not register an OAuth client or call `/oauth/token`.

`rejected`, `expired`, and `revoked` are terminal. Existing stored OAuth
credentials from older CLI releases remain supported and refresh normally;
new bootstrap flows do not create OAuth credentials.

See [`examples/agent-bootstrap.sh`](examples/agent-bootstrap.sh) for the same
sequence as a script, and
[`docs/operation-inventory.md`](../docs/operation-inventory.md) for commands,
output envelopes, and stable exit codes.
