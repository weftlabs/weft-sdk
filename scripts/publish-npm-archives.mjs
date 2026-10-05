// Release orchestration: promote the tested SDK archive; fail closed on registry
// errors or byte mismatches. A rerun skips only a version with identical integrity.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

const registry = "https://registry.npmjs.org";

async function registryGet(path) {
  const response = await fetch(`${registry}/${path}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { "cache-control": "no-cache" },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`npm registry returned ${response.status} for ${path}`);
  return response.json();
}

export async function publishArchives(
  packages,
  tag,
  {
    get = registryGet,
    wait = setTimeout,
    publish = (archive) =>
      execFileSync(
        "pnpm",
        [
          "publish",
          archive,
          "--access",
          "public",
          "--provenance",
          "--ignore-scripts",
          "--no-git-checks",
          "--registry",
          registry,
        ],
        { stdio: "inherit" },
      ),
  } = {},
) {
  assert.equal(packages.length, 1, "Expected the SDK archive only");
  const [sdk] = packages;
  assert.equal(sdk.manifest.name, "@weftlabs/sdk");
  assert.match(sdk.manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(
    tag,
    `v${sdk.manifest.version}`,
    "Release tag must match the tested archive",
  );
  // Check the package name before publishing. Trusted publishing must be
  // configured on npm after the first manual package bootstrap.
  assert.ok(
    await get(encodeURIComponent(sdk.manifest.name)),
    `${sdk.manifest.name} must be bootstrapped and configured for trusted publishing`,
  );
  const { archive, manifest, integrity } = sdk;
  const path = `${encodeURIComponent(manifest.name)}/${manifest.version}`;
  let existing = await get(path);
  if (!existing) {
    await publish(archive);
    // npm can briefly return 404 after accepting a publish. Retry only the
    // read; never submit another publish after an uncertain result.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      existing = await get(path);
      if (existing) break;
      if (attempt < 5) await wait(2_000);
    }
  }
  assert.equal(
    existing?.dist?.integrity,
    integrity,
    `${manifest.name}@${manifest.version}: registry bytes differ from the tested archive`,
  );
  console.log(
    `${manifest.name}@${manifest.version}: registry integrity verified`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const directory = resolve(process.argv[2]);
  const packages = await Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith(".tgz"))
      .map(async (name) => {
        const archive = resolve(directory, name);
        const manifest = JSON.parse(
          execFileSync("tar", ["-xOf", archive, "package/package.json"], {
            encoding: "utf8",
          }),
        );
        const integrity = `sha512-${createHash("sha512")
          .update(await readFile(archive))
          .digest("base64")}`;
        return { archive, manifest, integrity };
      }),
  );
  await publishArchives(packages, process.env.GITHUB_REF_NAME);
}
