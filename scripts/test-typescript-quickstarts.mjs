import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const sdkDirectory = new URL("../typescript/", import.meta.url);
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "weft-sdk-quickstart-"),
);
// CI retains this exact archive for the publisher job.
const archiveDirectory = process.env.WEFT_PACKAGE_ARCHIVES
  ? resolve(process.env.WEFT_PACKAGE_ARCHIVES)
  : temporaryDirectory;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "pipe",
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} exited ${code}\n${stdout}${stderr}`,
          ),
        );
      }
    });
  });
}

const requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push({
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization,
    body,
  });

  response.setHeader("content-type", "application/json");
  if (request.url === "/api/v1/me") {
    response.end(
      JSON.stringify({
        data: {
          principal_type: "user",
          id: 1,
          email: "developer@example.com",
        },
      }),
    );
    return;
  }
  if (request.url === "/api/v1/search") {
    response.end(
      JSON.stringify({
        query_trace_id: "quickstart-trace",
        query: "weather data API",
        embedder_model: "fixture",
        candidates_considered: 0,
        warnings: [],
        results: [],
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not found" }));
});

try {
  await mkdir(archiveDirectory, { recursive: true });
  await run("pnpm", ["pack", "--pack-destination", archiveDirectory], {
    cwd: sdkDirectory,
  });
  const archives = (await readdir(archiveDirectory)).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (archives.length !== 1 || !archives[0].includes("sdk")) {
    throw new Error(
      `Expected one SDK archive, found: ${archives.join(", ") || "(none)"}`,
    );
  }
  const sdkArchive = join(archiveDirectory, archives[0]);

  await writeFile(
    join(temporaryDirectory, "package.json"),
    JSON.stringify({
      name: "weft-artifact-consumer",
      private: true,
      dependencies: {
        "@weftlabs/sdk": `file:${sdkArchive}`,
      },
    }),
  );

  // The quickstart install gets its own pnpm store. Sharing the caller's store
  // would make this gate depend on whether that store is warm, which is state
  // no commit controls.
  await run(
    "pnpm",
    ["install", "--store-dir", join(temporaryDirectory, "pnpm-store")],
    { cwd: temporaryDirectory },
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Quickstart fixture server did not expose a TCP address");
  }
  const env = {
    ...process.env,
    WEFT_API_KEY: "wk_quickstart_fixture",
    WEFT_BASE_URL: `http://127.0.0.1:${address.port}`,
  };
  const installedPackage = join(
    temporaryDirectory,
    "node_modules",
    "@weftlabs",
    "sdk",
  );

  const nodeResult = await run(
    process.execPath,
    [join(installedPackage, "examples", "quickstart.mjs")],
    { cwd: temporaryDirectory, env },
  );
  const nodeOutput = JSON.parse(nodeResult.stdout);
  if (nodeOutput.account?.principalType !== "user") {
    throw new Error("Packed TypeScript quickstart did not decode account data");
  }

  if (
    requests.length !== 2 ||
    requests.some(
      (request) => request.authorization !== "Bearer wk_quickstart_fixture",
    )
  ) {
    throw new Error(
      "Packed quickstart did not authenticate all expected calls",
    );
  }

  const sdkPackageJson = JSON.parse(
    await readFile(join(installedPackage, "package.json"), "utf8"),
  );
  if (sdkPackageJson.bin != null) {
    throw new Error("Packed SDK must not expose a CLI binary");
  }
  if (sdkPackageJson.name !== "@weftlabs/sdk") {
    throw new Error(`Packed SDK has unexpected name: ${sdkPackageJson.name}`);
  }
  console.log(
    `Packed quickstart passed for ${sdkPackageJson.name}@${sdkPackageJson.version}.`,
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(temporaryDirectory, { recursive: true, force: true });
}
