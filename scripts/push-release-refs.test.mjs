import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./push-release-refs.sh", import.meta.url),
);
const prScript = fileURLToPath(new URL("./release-via-pr.sh", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trim();
}

function commit(cwd, message) {
  git(
    cwd,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    message,
  );
  return git(cwd, "rev-parse", "HEAD");
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), "weft-release-push-"));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const release = join(root, "release");

  git(root, "init", "--bare", remote);
  git(root, "init", "-b", "main", seed);
  commit(seed, "initial");
  const base = commit(seed, "base");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-u", "origin", "main");
  git(root, "clone", "--branch", "main", remote, release);

  return { base, release, remote, root };
}

function remoteRef(remote, ref) {
  try {
    git(remote, "show-ref", "--verify", "--quiet", ref);
    return git(remote, "rev-parse", ref);
  } catch {
    return null;
  }
}

function run(file, args, cwd, env = {}) {
  return execFileSync(file, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...env },
  }).trim();
}

// Squash-merge `branch` onto main in the remote, like GitHub would.
function mergeOnMain(root, remote, branch) {
  const m = join(root, "merger");
  git(root, "clone", "--branch", "main", remote, m);
  git(m, "fetch", "origin", branch);
  git(m, "merge", "--squash", "FETCH_HEAD");
  git(m, "-c", "user.name=T", "-c", "user.email=t@e.com", "commit", "--allow-empty", "-m", "sq");
  git(m, "push", "origin", "main");
  return git(m, "rev-parse", "HEAD");
}

test("tags the merged commit with both tags, nothing else moves", () => {
  const { base, release, remote, root } = repository();
  commit(release, "release");
  git(release, "push", "origin", "HEAD:refs/heads/release/v0.26.0");
  const merged = mergeOnMain(root, remote, "release/v0.26.0");

  run(script, ["0.26.0", merged, base], release);

  assert.equal(remoteRef(remote, "refs/heads/main"), merged);
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), merged);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), merged);
});

test("tags the source itself when there was no bump diff", () => {
  const { base, release, remote } = repository();
  run(script, ["0.26.0", base, base], release);
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), base);
});

test("refuses to tag when main moved during the PR wait", () => {
  const { base, release, remote, root } = repository();
  const c = join(root, "other");
  git(root, "clone", "--branch", "main", remote, c);
  commit(c, "concurrent");
  git(c, "push", "origin", "main");
  commit(release, "release");
  git(release, "push", "origin", "HEAD:refs/heads/release/v0.26.0");
  const merged = mergeOnMain(root, remote, "release/v0.26.0");

  assert.throws(() => run(script, ["0.26.0", merged, base], release));
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), null);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), null);
});

test("leaves both tags absent when the atomic push is rejected", () => {
  const { base, release, remote, root } = repository();
  commit(release, "release");
  git(release, "push", "origin", "HEAD:refs/heads/release/v0.26.0");
  const merged = mergeOnMain(root, remote, "release/v0.26.0");

  const updateHook = join(remote, "hooks", "update");
  writeFileSync(updateHook, '#!/bin/sh\n[ "$1" != "refs/tags/go/v0.26.0" ]\n');
  chmodSync(updateHook, 0o755);

  assert.throws(() => run(script, ["0.26.0", merged, base], release));
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), null);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), null);
});

// Fake `gh`: `pr list` / `pr view` print canned JSON, `pr create` prints a URL.
function fakeGh(root, { list = "[]", view = "{}" }) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(root, "gh.log");
  writeFileSync(join(root, "list.json"), list);
  writeFileSync(join(root, "view.json"), view);
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh\necho "$@" >> "${log}"\ncase "$1 $2" in\n"pr list") cat "${root}/list.json";;\n"pr view") cat "${root}/view.json";;\n"pr create") echo https://github.com/o/r/pull/7;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  return { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", RELEASE_PR_POLL_SECS: "0" };
}

test("release-via-pr pushes the branch, opens a PR, auto-merges, returns the merge SHA", () => {
  const { base, release, remote, root } = repository();
  const released = commit(release, "release");
  const env = fakeGh(root, {
    view: '{"state":"MERGED","mergeCommit":{"oid":"abc123"}}',
  });

  const out = run(prScript, ["0.26.0", base], release, env);

  assert.equal(out.split("\n").pop(), "abc123");
  assert.equal(remoteRef(remote, "refs/heads/release/v0.26.0"), released);
  assert.equal(remoteRef(remote, "refs/heads/main"), base);
  const calls = execFileSync("cat", [join(root, "gh.log")], { encoding: "utf8" });
  assert.match(calls, /pr create .*--head release\/v0\.26\.0/);
  assert.match(calls, /pr merge .* 7 --auto --squash/);
});

test("release-via-pr reuses an open PR and an existing branch on re-run", () => {
  const { base, release, remote, root } = repository();
  git(release, "push", "origin", "HEAD:refs/heads/release/v0.26.0");
  const released = commit(release, "release");
  const env = fakeGh(root, {
    list: '[{"number":9,"state":"OPEN","mergeCommit":null}]',
    view: '{"state":"MERGED","mergeCommit":{"oid":"def456"}}',
  });

  const out = run(prScript, ["0.26.0", base], release, env);

  assert.equal(out.split("\n").pop(), "def456");
  assert.equal(remoteRef(remote, "refs/heads/release/v0.26.0"), released);
  const calls = execFileSync("cat", [join(root, "gh.log")], { encoding: "utf8" });
  assert.doesNotMatch(calls, /pr create/);
});

test("release-via-pr returns the merge SHA of an already merged PR without pushing", () => {
  const { base, release, remote, root } = repository();
  commit(release, "release");
  const env = fakeGh(root, {
    list: '[{"number":9,"state":"MERGED","mergeCommit":{"oid":"fff000"}}]',
  });

  assert.equal(run(prScript, ["0.26.0", base], release, env), "fff000");
  assert.equal(remoteRef(remote, "refs/heads/release/v0.26.0"), null);
});

test("release-via-pr fails when the PR is closed unmerged or times out", () => {
  for (const view of ['{"state":"CLOSED"}', '{"state":"OPEN"}']) {
    const { base, release, root } = repository();
    commit(release, "release");
    const env = fakeGh(root, { view });
    env.RELEASE_PR_TIMEOUT_SECS = "0";
    assert.throws(() => run(prScript, ["0.26.0", base], release, env));
  }
});

test("release-via-pr refuses when main moved before the PR", () => {
  const { base, release, remote, root } = repository();
  commit(release, "release");
  const c = join(root, "other");
  git(root, "clone", "--branch", "main", remote, c);
  commit(c, "concurrent");
  git(c, "push", "origin", "main");
  const env = fakeGh(root, {});

  assert.throws(() => run(prScript, ["0.26.0", base], release, env));
  assert.equal(remoteRef(remote, "refs/heads/release/v0.26.0"), null);
});
