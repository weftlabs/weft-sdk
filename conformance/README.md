# Conformance

A case is one object in `conformance/client/*.json` or `conformance/facilitator/*.json`. Client cases drive the buyer façade over HTTP. Facilitator cases drive the pure seller contracts.

TypeScript is the reference. A fixture is valid only when the TypeScript runner passes it against current TypeScript code.

Add a case by appending an object to the matching file. Runners load every `*.json`. A `languages` list skips that case elsewhere. Use it only when the concept does not exist in the other language.

`$ADAPTER` and `$SDK_VERSION` are runner substitutions. `expectError.details: null` means the error has no details object.

TypeScript: `cd typescript && pnpm exec vitest run tests/conformance.test.ts`

Python client: `cd python && pytest tests/test_conformance_client.py`

Ruby and Go runners are later layers. They load the same files.

## Known differences (not asserted)

- Network-error `details`: TypeScript keeps the transport cause. Python sets `details` to `None`. The fixture does not list `details` for that case. This is not a missing façade field.
- `match_quality` default: the generated Python model emits `"none"` when the field is absent. TypeScript omits it. Shared search cases set the field. This is generated-model output, not a façade choice.
- `principalType`: the generated TypeScript serializer adds this camelCase key beside `principal_type`. The runner checks it, then compares the snake_case wire object. This is not a second API field.
- Datetime and UUID: Python `to_dict()` leaves those objects, and `to_json()` cannot encode them. The Python runner encodes them as wire strings before the exact compare. This is generated-serializer output, not a façade choice.
