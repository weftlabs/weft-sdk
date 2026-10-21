#!/usr/bin/env bash
# Tag the merged release commit `v<version>` and `go/v<version>` atomically.
set -euo pipefail

version="${1:?release version is required}"
merged_sha="${2:?merged release commit SHA is required}"
source_sha="${3:?SDK source SHA that passed e2e is required}"

git fetch origin main
git cat-file -e "$merged_sha^{commit}" 2>/dev/null || git fetch origin "$merged_sha"

if ! git merge-base --is-ancestor "$merged_sha" origin/main; then
  echo "::error::$merged_sha is not on origin/main; refusing to create release tags"
  exit 1
fi

# The merged commit must be the e2e-tested source plus the bump. If main moved
# while the PR waited for checks, what we tested is not what would ship.
if [[ "$merged_sha" != "$source_sha" && "$(git rev-parse "$merged_sha^")" != "$source_sha" ]]; then
  echo "::error::main moved during the release PR; $merged_sha is not $source_sha plus the bump. Refusing to tag; re-run the release."
  exit 1
fi

git tag "v$version" "$merged_sha"
git tag "go/v$version" "$merged_sha"
git push --atomic origin "v$version" "go/v$version"
