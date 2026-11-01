import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../.github/workflows/", import.meta.url);

// Third-party actions run in jobs that build or publish the SDKs, so each one
// is pinned to a full commit SHA. GitHub-owned `actions/*` may use tags.
test("third-party workflow actions are pinned to a commit SHA", () => {
  const unpinned = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".yml"))) {
    for (const match of readFileSync(new URL(file, dir), "utf8").matchAll(
      /uses:\s*([^\s#]+)/g,
    )) {
      const [action, ref] = match[1].split("@");
      if (action.startsWith("actions/") || action.startsWith("./")) continue;
      if (!/^[0-9a-f]{40}$/.test(ref ?? ""))
        unpinned.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual(unpinned, []);
});
