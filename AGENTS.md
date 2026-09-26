# weft-sdk

## Purpose

Polyglot client SDK monorepo for Weft Labs, consumed by external developers and by Weft's own docs/release automation.

## Stack

- **Contract source:** OpenAPI 3.x at `spec/openapi.yaml`, synced from `weft-app/docs/openapi.yaml`.
- **Code generation:** OpenAPI Generator through `scripts/generate-*.sh`; generated clients are committed.
- **TypeScript:** pnpm workspace, Node >=18, TypeScript 5, tsup, Vitest, ESLint, Prettier. `@weftlabs/sdk` is the library; `@weftlabs/cli` owns the `weft` executable.
- **Python:** Python >=3.10, Hatchling, httpx, pytest, Ruff, strict mypy.
- **Ruby:** Ruby 3.2 in CI, Bundler, Minitest, RubyGems packaging.
- **Go:** Go 1.23 module at `github.com/weftlabs/weft-sdk/go`.

## Commands

```sh
scripts/generate-all.sh                         # Regenerate all language SDKs from spec/openapi.yaml
scripts/test-sdk.sh                             # Verify generated SDK outputs exist
mise exec -- pnpm install --frozen-lockfile     # Install TypeScript workspace
mise exec -- pnpm run check                     # SDK + CLI tests, artifacts, lint, format, build
cd python && pip install -e . pytest pytest-asyncio ruff mypy && pytest
cd python && ruff check . && mypy src           # Python lint + typecheck
cd ruby && bundle install && bundle exec rake test
cd go && go test ./...                          # Go tests
```

If pre-commit / pre-push hooks exist, they run automatically; agents should not skip them with `--no-verify`.

## Repo-Specific Constraints

- All four SDKs and the CLI share one version tied to the OpenAPI spec version; use `scripts/bump-version.sh` instead of editing package versions by hand.
- Never hand-edit generated clients under `typescript/src/generated/`, `python/src/weft_sdk/generated/`, `ruby/lib/weft/generated/`, or `go/generated/`; update `spec/openapi.yaml` and rerun generation.
- `spec/openapi.yaml` is copied from `weft-app`; repo-local API contract changes should be treated as drift unless paired with the app-side canonical spec.
- The release pipeline is auto-PR-led: each `weft-app-openapi-updated` dispatch opens an auto-merge PR on `sdk-candidate/weft-app-<short_sha>`, gated by per-language build/test + staging e2e (`e2e.yml`) checks. No `.release-candidates/` JSON marker exists anymore.
- Workflow pushes that must trigger follow-on CI need bot-token auth, not the default `GITHUB_TOKEN` recursion guard.

## PR Rules

- Branch from `main`. Open PRs against `main`.
- Required checks must pass before merge.
- Patrick is the sole reviewer; do not self-merge.

## Where to Look Next

- **Repo-internal context:** `docs/README.md` is the public language guide. Internal architecture does not live in this public repo.
- **Cross-repo context (when checked out as part of `weft-dev`):** `../cto-os/` (workspace state, plans, cross-repo directives, contracts)
- **Single-repo checkout:** this file plus `docs/` is the full picture; cross-repo context is unavailable, so scope work to what this repo owns.

## Related

- `docs/README.md` — map of this repo's docs folder
- `README.md` — package layout, versioning, spec sync, and auto-PR release overview
- `../cto-os/repos/weft-sdk.md` — cross-repo brief when the full workspace is checked out
