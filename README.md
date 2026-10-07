# Weft SDK

Build buyer applications and agents on Weft. The TypeScript SDK and the Python
buyer client are the supported application surfaces in this repository.
Generated clients remain available when you need direct access to the OpenAPI
contract. The `weft` command-line client is a separate package:
[weftlabs/weft-cli](https://github.com/weftlabs/weft-cli).

For a source checkout, start with [local development tools](#local-development-tools).
The buyer quickstarts below use a real account; they are not local setup checks.

## TypeScript quickstart

1. Sign in at [weft.network](https://weft.network).
2. Create a buyer API key in
   [Dashboard → API keys](https://weft.network/dashboard/buyer/api_keys). Copy
   the one-time `wk_*` value and keep it out of source control.
3. Install the SDK and set the key in your shell:

   ```sh
   npm install @weftlabs/sdk @x402/core
   export WEFT_API_KEY="wk_..."
   ```

4. Create `quickstart.mjs`:

   ```js
   import { WeftClient } from "@weftlabs/sdk";

   const apiKey = process.env.WEFT_API_KEY;
   if (!apiKey) throw new Error("Set WEFT_API_KEY to a buyer wk_* API key");

   const weft = new WeftClient({ apiKey });

   const account = await weft.me();
   const search = await weft.search({ query: "weather data API" });

   console.log({ account: account.data, results: search.results });
   ```

   ```sh
   node quickstart.mjs
   ```

`WeftClient` uses `https://weft.network` by default. See the
[TypeScript guide](typescript/README.md) for bounded paid fetches, retries, error
handling, and low-level generated APIs. The executable source for the
quickstart is shipped in the package at
[`examples/quickstart.mjs`](typescript/examples/quickstart.mjs).

## CLI

The command-line client is not in this repository. Install and use it from
[weftlabs/weft-cli](https://github.com/weftlabs/weft-cli).

## npm scope migration

The SDK npm package now uses `@weftlabs/sdk`. To migrate an existing project,
replace `@weft-labs/sdk` in its dependencies and imports, including subpath
imports such as `/server` and `/facilitator/middleware`.

The CLI package is
[`@weftlabs/cli`](https://github.com/weftlabs/weft-cli).
For a global CLI installation, uninstall `@weft-labs/cli` before installing
[`@weftlabs/cli`](https://github.com/weftlabs/weft-cli); both packages provide
the same `weft` command.

The old packages remain available for existing installations. This scope change
keeps the shared version at `0.25.0` and does not change the public API. If your
project uses an older version, check the intervening API changes as part of the
upgrade.

## Language support

| Language | Package | Support level | Recommended surface |
|---|---|---|---|
| TypeScript | `@weftlabs/sdk` | Supported | `WeftClient` |
| Python | `weft-sdk` | Supported | `Client` buyer façade |
| Ruby | `weft-sdk` | Generated client preview | Generated APIs |
| Go | `github.com/weftlabs/weft-sdk/go` | Generated client preview | Generated APIs |

“Generated client preview” means the package is published and tracks the API
contract, but has not yet passed a clean-install buyer quickstart gate.

## Reference and support

- [Weft Labs](https://weftlabs.com)
- [API reference](https://weft.network/docs)
- [OpenAPI document](https://weft.network/docs/openapi.yaml)
- [Weft CLI guide](https://weftlabs.com/x402/cli)
- [x402 in Next.js](https://weftlabs.com/x402/nextjs)
- [Learn](https://weftlabs.com/learn)
- [x402 protocol](https://weftlabs.com/protocols/x402)
- [MPP](https://weftlabs.com/protocols/mpp)
- [How AI agents buy APIs](https://weftlabs.com/learn/how-ai-agents-buy-apis)
- [AI agent payments](https://weftlabs.com/learn/ai-agent-payments)
- [TypeScript package guide](typescript/README.md)
- [Python package guide](python/README.md)
- [GitHub issues](https://github.com/weftlabs/weft-sdk/issues)

## Repository layout

- `spec/openapi.yaml` — canonical contract copy synchronized from `weft-app`
- `typescript/` — npm package `@weftlabs/sdk`
- `python/` — PyPI package `weft-sdk`
- `ruby/` — RubyGems package `weft-sdk`
- `go/` — Go module `github.com/weftlabs/weft-sdk/go`
- `scripts/` — generation, conformance, and release checks

All language packages share a version tied to the OpenAPI version. Generated
sources are updated by the spec-sync workflow and must not be edited manually.

## Local development tools

Install Git and [Mise](https://mise.jdx.dev/getting-started.html), and
[activate Mise in your interactive shell](https://mise.jdx.dev/getting-started.html#activate-mise)
once. Run these blocks separately from the repository root; after tool
installation, wait for the next shell prompt before installing dependencies. [`.mise.toml`](.mise.toml) owns the
source runtimes and tools; manifests and lockfiles own package dependencies.
Published TypeScript packages still support Node.js 18 or newer; the source
build runtime is a separate selection, not the consumer compatibility floor.

No Weft account, API key, wallet key or provider credential is needed for
source installation, builds or unit tests. Use a credential-free environment;
do not copy active account configuration into the checkout. Tool/dependency
installation needs download access. Review the tool configuration, then:

```sh
mise trust
mise install
```

Then install dependencies and hooks:

```sh
pnpm install --frozen-lockfile
uv sync --project python --python "$(mise which python)" --frozen --group dev
cd ruby
bundle config set --local path vendor/bundle
bundle config set --local frozen true
bundle install
cd ..
go -C go mod download
lefthook install
```

Build the source packages and run the TypeScript unit checks:

```sh
pnpm run build
pnpm --filter @weftlabs/sdk run test:unit
```

[package.json](package.json) owns the build and broader `check` commands.
[lefthook.yml](lefthook.yml) owns the language-specific unit gates: pre-commit
checks lint or format staged files only; pre-push runs whole-repo lint and
format checks plus TypeScript, Python, Ruby and Go unit tests. The Python hook
uses the installed environment without dependency sync. Run the setup
commands again after dependency changes. Builds, generated-code checks,
type checks, quickstarts, and network tests remain in CI.

These packages are libraries, not an API server. Build/unit commands return
when finished; there is no persistent SDK service to start or stop. Live
buyer/seller examples, staging checks, spec regeneration and publishing are
separate operations. Do not use a paid fetch or wallet bootstrap as setup
verification, and do not hand-edit generated clients.
