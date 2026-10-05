#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/weft-sdk-artifacts.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Testing the packed TypeScript SDK package..."
(
  cd "$ROOT_DIR"
  pnpm run test:artifacts
)

echo "Building and clean-installing the Python artifact..."
python3 -m build --outdir "$TEMP_DIR/python-dist" "$ROOT_DIR/python"
python3 -m venv "$TEMP_DIR/python-consumer"
"$TEMP_DIR/python-consumer/bin/python" -m pip install --quiet \
  "$TEMP_DIR"/python-dist/*.whl
"$TEMP_DIR/python-consumer/bin/python" \
  "$ROOT_DIR/scripts/test-python-quickstart.py"

echo "Building and clean-installing the Ruby artifact..."
(
  cd "$ROOT_DIR/ruby"
  gem build weft-sdk.gemspec --output "$TEMP_DIR/weft-sdk.gem" >/dev/null
)
gem install "$TEMP_DIR/weft-sdk.gem" --install-dir "$TEMP_DIR/ruby-consumer" \
  --no-document >/dev/null
GEM_HOME="$TEMP_DIR/ruby-consumer" GEM_PATH="$TEMP_DIR/ruby-consumer" \
  ruby -e 'require "weft/sdk"; abort unless Weft::SDK::VERSION'

echo "Compiling the Go module from a clean consumer..."
mkdir "$TEMP_DIR/go-consumer"
(
  cd "$TEMP_DIR/go-consumer"
  go mod init example.com/weft-quickstart >/dev/null
  go mod edit \
    -replace "github.com/weftlabs/weft-sdk/go=$ROOT_DIR/go"
  go get github.com/weftlabs/weft-sdk/go@v0.0.0 >/dev/null
  printf '%s\n' \
    'package main' \
    'import _ "github.com/weftlabs/weft-sdk/go"' \
    'func main() {}' > main.go
  go run .
)

echo "All advertised SDK artifacts build and clean-install successfully."
