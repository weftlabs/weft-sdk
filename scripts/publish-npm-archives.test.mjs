import assert from "node:assert/strict";
import { test } from "node:test";
import { publishArchives } from "./publish-npm-archives.mjs";

const packages = () => [
  {
    archive: "sdk.tgz",
    integrity: "sha512-sdk",
    manifest: {
      name: "@weftlabs/sdk",
      version: "0.25.0",
    },
  },
];

function registry({
  existing = false,
  mismatch = false,
  absent = false,
  error = false,
} = {}) {
  const published = [];
  return {
    published,
    publish: async (archive) => published.push(archive),
    get: async (path) => {
      if (error) throw new Error("registry unavailable");
      if (!path.includes("/")) return absent ? null : {};
      return existing || published.includes("sdk.tgz")
        ? { dist: { integrity: mismatch ? "different" : "sha512-sdk" } }
        : null;
    },
  };
}

test("publishes the tested SDK archive and checks registry integrity", async () => {
  const api = registry();
  await publishArchives(packages(), "v0.25.0", api);
  assert.deepEqual(api.published, ["sdk.tgz"]);
});

test("recovery skips only an existing version with identical bytes", async () => {
  const api = registry({ existing: true });
  await publishArchives(packages(), "v0.25.0", api);
  assert.deepEqual(api.published, []);
});

test("waits for registry propagation without submitting another publish", async () => {
  const api = registry();
  const get = api.get;
  const reads = new Map();
  const waits = [];
  api.wait = async (ms) => waits.push(ms);
  api.get = async (path) => {
    if (path.includes("/")) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      if (reads.get(path) < 4) return null;
    }
    return get(path);
  };
  await publishArchives(packages(), "v0.25.0", api);
  assert.deepEqual(api.published, ["sdk.tgz"]);
  assert.equal(reads.get("%40weftlabs%2Fsdk/0.25.0"), 4);
  assert.equal(waits.length, 2);
});

test("stops after bounded readback when a published SDK stays absent", async () => {
  const api = registry();
  const waits = [];
  api.wait = async (ms) => waits.push(ms);
  api.get = async (path) => (path.includes("/") ? null : {});
  await assert.rejects(publishArchives(packages(), "v0.25.0", api));
  assert.deepEqual(api.published, ["sdk.tgz"]);
  assert.equal(waits.length, 5);
});

for (const [label, options] of [
  ["different bytes", { existing: true, mismatch: true }],
  ["missing package bootstrap", { absent: true }],
  ["registry outage", { error: true }],
]) {
  test(`refuses publication on ${label}`, async () => {
    const api = registry(options);
    await assert.rejects(publishArchives(packages(), "v0.25.0", api));
    assert.deepEqual(api.published, []);
  });
}

test("rejects different registry bytes after the SDK upload", async () => {
  const api = registry({ mismatch: true });
  await assert.rejects(publishArchives(packages(), "v0.25.0", api));
  assert.deepEqual(api.published, ["sdk.tgz"]);
});

test("rejects a tag mismatch, a second archive, or a non-SDK package", async () => {
  const api = registry();
  await assert.rejects(publishArchives(packages(), "v0.24.0", api));
  const extra = packages();
  extra.push({
    archive: "other.tgz",
    integrity: "sha512-other",
    manifest: { name: "@weftlabs/other", version: "0.25.0" },
  });
  await assert.rejects(publishArchives(extra, "v0.25.0", api));
  const wrong = packages();
  wrong[0].manifest.name = "@weftlabs/other";
  await assert.rejects(publishArchives(wrong, "v0.25.0", api));
  await assert.rejects(publishArchives([], "v0.25.0", api));
  assert.deepEqual(api.published, []);
});
