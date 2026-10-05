#!/usr/bin/env bash
set -euo pipefail

# Bumps all SDK version files to the specified version.
# Usage: ./scripts/bump-version.sh 0.3.0

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.3.0"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g., 0.3.0)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

errors=0

bump_file() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if [ ! -f "$file" ]; then
    echo "Error: $file not found"
    errors=$((errors + 1))
    return
  fi

  if sed -i.bak "$pattern" "$file" && [ -f "$file.bak" ]; then
    if diff -q "$file" "$file.bak" > /dev/null 2>&1; then
      # No change — check if file already contains the target version (idempotent retry)
      if grep -q "$VERSION" "$file"; then
        echo "Already at $VERSION: $label"
      else
        echo "Warning: No change made to $file — pattern may not have matched"
        errors=$((errors + 1))
      fi
    else
      local updated_line
      updated_line=$(grep -m1 "$VERSION" "$file" || true)
      if [ -n "$updated_line" ]; then
        echo "Updated $label: $(echo "$updated_line" | sed 's/^[[:space:]]*//')"
      else
        echo "Updated $label"
      fi
    fi
    rm -f "$file.bak"
  else
    echo "Error: Failed to update $file"
    errors=$((errors + 1))
  fi
}

echo "Bumping all SDK versions to $VERSION"
echo "---"

# 1. OpenAPI spec — info.version
bump_file \
  "$ROOT_DIR/spec/openapi.yaml" \
  "s/^  version: .*/  version: $VERSION/" \
  "spec/openapi.yaml"

# 2. TypeScript — package.json "version"
bump_file \
  "$ROOT_DIR/typescript/package.json" \
  "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" \
  "typescript/package.json"

# 3. pnpm lockfile — synchronize workspace package versions without resolving
# new dependency versions.
if (
  cd "$ROOT_DIR"
  pnpm install --lockfile-only >/dev/null
); then
  echo "Updated pnpm-lock.yaml workspace versions: $VERSION"
else
  echo "Error: Failed to update pnpm-lock.yaml"
  errors=$((errors + 1))
fi

# 4. Python — pyproject.toml version
bump_file \
  "$ROOT_DIR/python/pyproject.toml" \
  "s/^version = \".*\"/version = \"$VERSION\"/" \
  "python/pyproject.toml"

# 5. Ruby — gemspec spec.version
bump_file \
  "$ROOT_DIR/ruby/weft-sdk.gemspec" \
  "s/spec\.version       = '.*'/spec.version       = '$VERSION'/" \
  "ruby/weft-sdk.gemspec"

# 6. Ruby — version.rb VERSION constant
bump_file \
  "$ROOT_DIR/ruby/lib/weft/generated/version.rb" \
  "s/VERSION = '.*'/VERSION = '$VERSION'/" \
  "ruby/lib/weft/generated/version.rb"

# 7. Ruby — SDK VERSION constant (hand-written, not generated)
bump_file \
  "$ROOT_DIR/ruby/lib/weft/sdk.rb" \
  "s/VERSION = '.*'/VERSION = '$VERSION'/" \
  "ruby/lib/weft/sdk.rb"

# 8. Ruby — Gemfile.lock pins the `weft-sdk` path-gem version twice (PATH/specs
# and CHECKSUMS). Without this, `bundle install --deployment` (used by the
# per-language Ruby SDK workflow and the Release workflow) fails frozen-mode
# with "The gemspecs for path gems changed, but the lockfile can't be updated".
bump_file \
  "$ROOT_DIR/ruby/Gemfile.lock" \
  "s/weft-sdk (.*)/weft-sdk ($VERSION)/g" \
  "ruby/Gemfile.lock"

echo "---"

if [ "$errors" -gt 0 ]; then
  echo "Completed with $errors error(s)"
  exit 1
fi

echo "All SDK versions bumped to $VERSION"
