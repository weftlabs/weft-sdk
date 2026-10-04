# Conformance

A case is one object in `conformance/client/*.json` or `conformance/facilitator/*.json`. Client cases drive the buyer façade over HTTP. Facilitator cases drive the pure seller contracts.

TypeScript is the reference. A fixture is valid only when the TypeScript runner passes it against current TypeScript code.

Add a case by appending an object to the matching file. Runners load every `*.json`. A `languages` list skips that case elsewhere; omit the list to run it in every language.

`$ADAPTER` and `$SDK_VERSION` are runner substitutions. `expectError.details: null` means the error has no details object.

TypeScript: `cd typescript && pnpm exec vitest run tests/conformance.test.ts`

Python client: `cd python && pytest tests/test_conformance_client.py`

Ruby and Go runners are later layers. They load the same files.
