#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "$2"
}

extract_first() {
  local pattern="$1"
  local file="$2"
  sed -nE "$pattern" "$file" | head -1
}

SPEC="${ROOT_DIR}/spec/openapi.yaml"
require_file "$SPEC" "OpenAPI spec missing."

SPEC_VERSION="$(extract_first 's/^  version: ["'\'']?([^ "'\'']+)["'\'']?$/\1/p' "$SPEC")"
[[ "$SPEC_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "spec/openapi.yaml info.version must be plain semver; got '${SPEC_VERSION:-missing}'."

require_file "${ROOT_DIR}/typescript/src/generated/index.ts" \
  "TypeScript generated SDK missing. Run ./scripts/generate-typescript.sh"
require_file "${ROOT_DIR}/typescript/src/client.ts" \
  "Hand-written TypeScript buyer client was removed during generation."
require_file "${ROOT_DIR}/pnpm-lock.yaml" \
  "pnpm workspace lockfile missing. Run pnpm install --lockfile-only."
[ ! -f "${ROOT_DIR}/typescript/package-lock.json" ] || \
  fail "package-lock.json is forbidden; use the root pnpm-lock.yaml."
require_file "${ROOT_DIR}/python/src/weft_sdk/generated/__init__.py" \
  "Python generated SDK missing. Run ./scripts/generate-python.sh"
require_file "${ROOT_DIR}/python/src/weft_sdk/client.py" \
  "Hand-written Python buyer client was removed during generation."
grep -q '^from \.client import Client$' "${ROOT_DIR}/python/src/weft_sdk/__init__.py" ||
  fail "Python package no longer exports the hand-written buyer Client."
require_file "${ROOT_DIR}/ruby/lib/weft/generated/version.rb" \
  "Ruby generated SDK missing. Run ./scripts/generate-ruby.sh"
require_file "${ROOT_DIR}/go/generated/client.go" \
  "Go generated SDK missing. Run ./scripts/generate-go.sh"

TS_VERSION="$(extract_first 's/^[[:space:]]*"version": "([^"]+)",?$/\1/p' \
  "${ROOT_DIR}/typescript/package.json")"
TS_GENERATED_VERSION="$(extract_first 's/^ \* The version of the OpenAPI document: ([^[:space:]]+)$/\1/p' \
  "${ROOT_DIR}/typescript/src/generated/models/AccountDetails.ts")"
PYTHON_VERSION="$(extract_first 's/^version = "([^"]+)"$/\1/p' \
  "${ROOT_DIR}/python/pyproject.toml")"
PYTHON_GENERATED_VERSION="$(extract_first 's/^__version__ = "([^"]+)"$/\1/p' \
  "${ROOT_DIR}/python/src/weft_sdk/generated/__init__.py")"
RUBY_VERSION="$(extract_first "s/^[[:space:]]*spec\\.version[[:space:]]*= '([^']+)'$/\\1/p" \
  "${ROOT_DIR}/ruby/weft-sdk.gemspec")"
RUBY_GENERATED_VERSION="$(extract_first "s/^[[:space:]]*VERSION = '([^']+)'$/\\1/p" \
  "${ROOT_DIR}/ruby/lib/weft/generated/version.rb")"
RUBY_SDK_VERSION="$(extract_first "s/^[[:space:]]*VERSION = '([^']+)'$/\\1/p" \
  "${ROOT_DIR}/ruby/lib/weft/sdk.rb")"
GO_GENERATED_VERSION="$(extract_first 's/^API version: ([^[:space:]]+)$/\1/p' \
  "${ROOT_DIR}/go/generated/client.go")"

for entry in \
  "TypeScript package:${TS_VERSION}" \
  "TypeScript generated client:${TS_GENERATED_VERSION}" \
  "Python package:${PYTHON_VERSION}" \
  "Python generated client:${PYTHON_GENERATED_VERSION}" \
  "Ruby package:${RUBY_VERSION}" \
  "Ruby generated client:${RUBY_GENERATED_VERSION}" \
  "Ruby SDK facade:${RUBY_SDK_VERSION}" \
  "Go generated client:${GO_GENERATED_VERSION}"; do
  label="${entry%%:*}"
  version="${entry#*:}"
  [ "$version" = "$SPEC_VERSION" ] ||
    fail "$label version '${version:-missing}' does not match OpenAPI version '$SPEC_VERSION'."
done

[ ! -f "${ROOT_DIR}/go/generated/go.mod" ] ||
  fail "go/generated/go.mod makes generated code a nested module skipped by root CI."

if grep -R -nE 'GIT_USER_ID|GIT_REPO_ID' \
  "${ROOT_DIR}/typescript/src/generated" \
  "${ROOT_DIR}/python/src/weft_sdk/generated" \
  "${ROOT_DIR}/ruby/lib/weft/generated" \
  "${ROOT_DIR}/go/generated"; then
  fail "Generated SDK contains unresolved OpenAPI Generator placeholders."
fi

echo "Generated SDK outputs, versions, module boundaries, and placeholders verified."
