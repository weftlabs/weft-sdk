#!/usr/bin/env bash
# Land the release bump commit (HEAD) on main through a PR, so the required
# checks (CodeQL, e2e, curation) run. Prints the merge commit SHA on stdout.
# Re-runnable: reuses an open PR, or returns the merge SHA of a merged one.
# Needs GH_TOKEN of a GitHub App (a GITHUB_TOKEN PR would not trigger CI).
set -euo pipefail

version="${1:?release version is required}"
expected_main_sha="${2:?expected main SHA is required}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
timeout_secs="${RELEASE_PR_TIMEOUT_SECS:-1800}"
poll_secs="${RELEASE_PR_POLL_SECS:-20}"
branch="release/v$version"

log() { echo "$@" >&2; }

prs="$(gh pr list -R "$repo" --head "$branch" --base main --state all --json number,state,mergeCommit)"
merged_sha="$(jq -r '[.[] | select(.state == "MERGED")][0].mergeCommit.oid // empty' <<<"$prs")"
if [[ -n "$merged_sha" ]]; then
  log "PR for $branch already merged"
  echo "$merged_sha"
  exit 0
fi

git fetch origin main >&2
actual_main_sha="$(git rev-parse FETCH_HEAD)"
if [[ "$actual_main_sha" != "$expected_main_sha" ]]; then
  log "::error::SDK main moved from $expected_main_sha to $actual_main_sha; refusing to open the release PR"
  exit 1
fi

# The branch is bot-owned and short-lived; the lease still refuses a surprise.
remote_branch_sha="$(git ls-remote origin "refs/heads/$branch" | cut -f1)"
git push --force-with-lease="refs/heads/$branch:$remote_branch_sha" origin "HEAD:refs/heads/$branch" >&2

pr="$(jq -r '[.[] | select(.state == "OPEN")][0].number // empty' <<<"$prs")"
if [[ -z "$pr" ]]; then
  url="$(gh pr create -R "$repo" --base main --head "$branch" \
    --title "release: v$version" \
    --body "Automated release bump for v$version. Tags v$version and go/v$version are pushed after this PR merges.")"
  pr="${url##*/}"
fi
log "Release PR #$pr"

# Auto-merge waits for the required checks. If checks already passed, GitHub
# refuses auto-merge; merge directly then.
gh pr merge -R "$repo" "$pr" --auto --squash --subject "release: v$version" >&2 ||
  gh pr merge -R "$repo" "$pr" --squash --subject "release: v$version" >&2

deadline=$((SECONDS + timeout_secs))
while :; do
  view="$(gh pr view -R "$repo" "$pr" --json state,mergeCommit)"
  state="$(jq -r '.state' <<<"$view")"
  if [[ "$state" == "MERGED" ]]; then
    jq -r '.mergeCommit.oid' <<<"$view"
    exit 0
  fi
  if [[ "$state" == "CLOSED" ]]; then
    log "::error::Release PR #$pr was closed without merging"
    exit 1
  fi
  if ((SECONDS >= deadline)); then
    log "::error::Release PR #$pr not merged after ${timeout_secs}s; required checks may be failing. Fix, then re-run: the open PR is reused."
    exit 1
  fi
  sleep "$poll_secs"
done
