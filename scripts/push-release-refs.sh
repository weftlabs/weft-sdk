#!/usr/bin/env bash
set -euo pipefail

version="${1:?release version is required}"
expected_main_sha="${2:?expected main SHA is required}"

git fetch origin main
actual_main_sha="$(git rev-parse FETCH_HEAD)"

if [[ "$actual_main_sha" != "$expected_main_sha" ]]; then
  echo "::error::SDK main moved from $expected_main_sha to $actual_main_sha; refusing to create release tags"
  exit 1
fi

git tag "v$version"
git tag "go/v$version"
git push \
  --atomic \
  --force-with-lease="refs/heads/main:$expected_main_sha" \
  origin \
  HEAD:main \
  "v$version" \
  "go/v$version"
