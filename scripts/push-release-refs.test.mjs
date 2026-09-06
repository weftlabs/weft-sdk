import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./push-release-refs.sh", import.meta.url),
);

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
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

test("pushes main and both release tags together when main is unchanged", () => {
  const { base, release, remote } = repository();
  const released = commit(release, "release");

  execFileSync(script, ["0.26.0", base], { cwd: release, stdio: "pipe" });

  assert.equal(remoteRef(remote, "refs/heads/main"), released);
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), released);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), released);
});

test("leaves every remote ref unchanged when main is rejected during push", () => {
  const { base, release, remote } = repository();
  commit(release, "release");

  const updateHook = join(remote, "hooks", "update");
  writeFileSync(updateHook, '#!/bin/sh\n[ "$1" != "refs/heads/main" ]\n');
  chmodSync(updateHook, 0o755);

  assert.throws(() =>
    execFileSync(script, ["0.26.0", base], {
      cwd: release,
      encoding: "utf8",
      stdio: "pipe",
    }),
  );

  assert.equal(remoteRef(remote, "refs/heads/main"), base);
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), null);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), null);
});

test("refuses a main rewind between the precheck and atomic push", () => {
  const { base, release, remote } = repository();
  const released = commit(release, "release");
  const ancestor = git(release, "rev-parse", `${base}~1`);

  const prePushHook = join(release, ".git", "hooks", "pre-push");
  writeFileSync(
    prePushHook,
    `#!/bin/sh\ngit --git-dir="${remote}" update-ref refs/heads/main "${ancestor}"\n`,
  );
  chmodSync(prePushHook, 0o755);

  assert.throws(() =>
    execFileSync(script, ["0.26.0", base], {
      cwd: release,
      encoding: "utf8",
      stdio: "pipe",
    }),
  );

  assert.notEqual(ancestor, released);
  assert.equal(remoteRef(remote, "refs/heads/main"), ancestor);
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), null);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), null);
});

test("refuses a moved main before creating either release tag", () => {
  const { base, release, remote, root } = repository();
  commit(release, "release");

  const concurrent = join(root, "concurrent");
  git(root, "clone", "--branch", "main", remote, concurrent);
  const advanced = commit(concurrent, "concurrent change");
  git(concurrent, "push", "origin", "main");

  assert.throws(() =>
    execFileSync(script, ["0.26.0", base], {
      cwd: release,
      encoding: "utf8",
      stdio: "pipe",
    }),
  );

  assert.equal(remoteRef(remote, "refs/heads/main"), advanced);
  assert.equal(remoteRef(remote, "refs/tags/v0.26.0"), null);
  assert.equal(remoteRef(remote, "refs/tags/go/v0.26.0"), null);
});
