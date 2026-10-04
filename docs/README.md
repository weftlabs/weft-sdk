# Weft SDK Documentation

The Weft SDK is published for four languages, each generated from the Weft API's
OpenAPI specification. Start with the per-language guide for the client you use.
The command-line client is a separate repository:
[weftlabs/weft-cli](https://github.com/weftlabs/weft-cli).

| Language   | Package                  | Guide                                  |
|------------|--------------------------|----------------------------------------|
| TypeScript | `@weftlabs/sdk` (npm)   | [`../typescript/README.md`](../typescript/README.md) |
| Python     | `weft-sdk` (PyPI)        | [`../python/README.md`](../python/README.md) |
| Ruby       | `weft-sdk` (RubyGems)    | [`../ruby/README.md`](../ruby/README.md) |
| Go         | `github.com/weftlabs/weft-sdk/go` | [`../go/README.md`](../go/README.md) |

The clients are generated. Do not hand-edit files under `*/src/generated` (or the
Go equivalent) — they are overwritten on the next spec sync.

See the [root README](../README.md) for repository layout and contribution notes.
