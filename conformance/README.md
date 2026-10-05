# Conformance

A case is one object in `conformance/client/*.json` or `conformance/facilitator/*.json`. Client cases drive the buyer façade over HTTP. Facilitator cases drive the pure seller contracts.

TypeScript is the reference. A fixture is valid only when the TypeScript runner passes it against current TypeScript code.

Add a case by appending an object to the matching file. Runners load every `*.json`. A `languages` list skips that case elsewhere. Use it only when the concept does not exist in the other language.

`$ADAPTER` and `$SDK_VERSION` are runner substitutions. `expectError.details: null` means the error has no details object.

`$fixture` replaces a value that a JSON file cannot store. Client runners accept `non-finite-body`. That value is an object with `NaN`, `Infinity`, and `-Infinity`, including nested values.

TypeScript: `cd typescript && pnpm exec vitest run tests/conformance.test.ts`

Python client: `cd python && pytest tests/test_conformance_client.py`

Ruby and Go runners are later layers. They load the same files.

`expectError.charge` is asserted in every language. The pre-sign fetch code
list is the same in each façade; its owner is
`cto-os/specs/paid-fetch/01-charge-outcome.md`, from the weft-app raise sites.

## Known differences (not asserted)

- Network-error `details`: TypeScript keeps the transport cause. Python sets `details` to `None`. The fixture does not list `details` for that case. This is not a missing façade field.
- Ruby API errors raise `Weft::RequestError`. The generated model already owns `Weft::Error`.
- Go map fetch body: a caller-supplied Go map is serialized with sorted keys, not `JSON.stringify` insertion order. HTML escaping is disabled.
- `match_quality` default: the generated Python model emits `"none"` when the field is absent. TypeScript omits it. Shared search cases set the field. This is generated-model output, not a façade choice.
- `principalType`: the generated TypeScript serializer adds this camelCase key beside `principal_type`. The runner checks it, then compares the snake_case wire object. This is not a second API field.
- Datetime and UUID: Python `to_dict()` leaves those objects, and `to_json()` cannot encode them. The Python runner encodes them as wire strings before the exact compare. This is generated-serializer output, not a façade choice.

## Asserted wire differences

- Malformed `searchId`: the fixture body is the TypeScript wire. It includes `search_id: "not-a-uuid"`. `FetchRequestToJSON` forwards that string. The server ignores a value that is not a well-formed handle. The Python generated model types `search_id` as UUID, so the façade omits the field and does not raise. The Python runner removes that invalid `search_id` from the expected body before compare.
