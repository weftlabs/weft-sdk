import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { extractOperationIds } from "./check-operation-inventory.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const checker = fileURLToPath(
  new URL("./check-operation-inventory.mjs", import.meta.url),
);
const specPath = join(repoRoot, "spec/openapi.yaml");
const inventoryPath = join(repoRoot, "conformance/operations.json");

const specOperations = [
  "getOpenApiDocument",
  "createAccountBootstrap",
  "getAccountBootstrap",
  "cancelAccountBootstrap",
  "enrollResource",
  "signUp",
  "confirmAccount",
  "resendConfirmation",
  "signIn",
  "requestPasswordReset",
  "updatePassword",
  "getMe",
  "listApiKeys",
  "createApiKey",
  "revokeApiKey",
  "getBalance",
  "search",
  "fetch",
  "listPayments",
  "getPayment",
  "listPurchases",
  "getPurchase",
];

function run(args) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function problems(result) {
  return `${result.stdout}${result.stderr}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function withCopy(source, mutate) {
  const dir = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  const path = join(dir, source.slice(source.lastIndexOf("/") + 1));
  try {
    writeFileSync(path, mutate(readFileSync(source, "utf8")));
    return { dir, path };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function finish(dir, result) {
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test("the real spec and inventory agree", () => {
  const result = run([]);
  assert.equal(
    result.status,
    0,
    problems(result).join("\n") || result.stderr || result.stdout,
  );
  assert.deepEqual(extractOperationIds(readFileSync(specPath, "utf8")), specOperations);
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  assert.deepEqual(inventory.languages, ["typescript", "python"]);
  assert.deepEqual(
    inventory.operations.map((operation) => operation.operationId),
    specOperations,
  );
  assert.equal(
    JSON.stringify(inventory).includes("getCuratedMarketplaceContract"),
    false,
  );
});

test("an added spec operation fails", () => {
  const { dir, path } = withCopy(specPath, (spec) =>
    spec.replace(
      /^components:/m,
      [
        "  /api/v1/phantom_added:",
        "    get:",
        "      operationId: phantomAddedOperation",
        "      description: |",
        "        operationId: phantomInsideAddedDescription",
        "components:",
      ].join("\n"),
    ),
  );
  const result = finish(dir, run(["--spec", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes(
      "spec operation phantomAddedOperation is absent from the inventory",
    ),
  );
  assert.equal(
    problems(result).some((line) => line.includes("phantomInsideAddedDescription")),
    false,
  );
});

test("a removed spec operation fails", () => {
  const { dir, path } = withCopy(specPath, (spec) =>
    spec.replace("      operationId: getPurchase\n", ""),
  );
  const result = finish(dir, run(["--spec", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes(
      "inventory operation getPurchase is absent from the spec",
    ),
  );
});

test("a duplicate spec operation fails", () => {
  const { dir, path } = withCopy(specPath, (spec) =>
    spec.replace(
      /^components:/m,
      [
        "  /api/v1/phantom_duplicate:",
        "    get:",
        "      operationId: getMe",
        "components:",
      ].join("\n"),
    ),
  );
  const result = finish(dir, run(["--spec", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes("operation getMe appears twice in the spec"),
  );
});

test("a duplicate inventory operation fails", () => {
  const { dir, path } = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    inventory.operations.push({
      ...inventory.operations.find((operation) => operation.operationId === "getMe"),
    });
    return JSON.stringify(inventory);
  });
  const result = finish(dir, run(["--inventory", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes("operation getMe appears twice in the inventory"),
  );
});

test("a façade method missing from source fails", () => {
  const { dir, path } = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "getMe",
    );
    operation.methods.typescript = "missingFacadeMethod";
    return JSON.stringify(inventory);
  });
  const result = finish(dir, run(["--inventory", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes(
      "typescript façade method missingFacadeMethod for getMe is absent from typescript/src/client.ts",
    ),
  );
});

test("a façade operation without a language method fails", () => {
  const { dir, path } = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "getMe",
    );
    delete operation.methods.python;
    return JSON.stringify(inventory);
  });
  const result = finish(dir, run(["--inventory", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes("operation getMe lacks a python façade method"),
  );
});

test("an invalid classification fails", () => {
  const { dir, path } = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "signIn",
    );
    operation.classification = "public";
    return JSON.stringify(inventory);
  });
  const result = finish(dir, run(["--inventory", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes(
      'operation signIn has invalid classification "public"',
    ),
  );
});

test("an empty reason fails", () => {
  const { dir, path } = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "signIn",
    );
    operation.reason = "   ";
    return JSON.stringify(inventory);
  });
  const result = finish(dir, run(["--inventory", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes("operation signIn has an empty reason"),
  );
});

test("stale generated markdown fails", () => {
  const { dir, path } = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "getMe",
    );
    operation.reason = "Buyer runtime changed";
    return JSON.stringify(inventory);
  });
  const result = finish(dir, run(["--inventory", path]));
  assert.notEqual(result.status, 0);
  assert.ok(
    problems(result).includes(
      "docs/operation-inventory.md operation table is out of date",
    ),
  );
});

test("description text that contains operationId is not an operation", () => {
  const spec = [
    "openapi: 3.1.0",
    "info:",
    "  title: fixture",
    "  version: '0'",
    "  description: |",
    "    operationId: phantomFromInfo",
    "paths:",
    "  /example:",
    "    get:",
    "      summary: text operationId: phantomFromSummary",
    "      description: |",
    "        The word operationId appears in this description.",
    "        operationId: phantomFromBlock",
    "        post:",
    "          operationId: phantomNestedInDescription",
    "      operationId: realOperation",
    '      x-note: "operationId: phantomQuoted"',
    "components:",
    "  schemas:",
    "    Example:",
    "      description: >",
    "        operationId: phantomFromComponent",
    "      properties:",
    "        operationId:",
    "          type: string",
    "          description: operationId: phantomFromPropertyText",
    "",
  ].join("\n");
  const naive = [...spec.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)].map(
    ([, operationId]) => operationId,
  );
  assert.ok(naive.includes("phantomFromBlock"));
  assert.ok(naive.includes("phantomNestedInDescription"));
  assert.deepEqual(extractOperationIds(spec), ["realOperation"]);

  const dir = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  const fixtureSpec = join(dir, "openapi.yaml");
  const fixtureInventory = join(dir, "operations.json");
  writeFileSync(fixtureSpec, spec);
  writeFileSync(
    fixtureInventory,
    JSON.stringify({
      languages: ["typescript", "python"],
      operations: [
        {
          operationId: "realOperation",
          classification: "excluded",
          cli: null,
          reason: "fixture",
        },
      ],
    }),
  );
  const result = finish(dir, run(["--spec", fixtureSpec, "--inventory", fixtureInventory]));
  const lines = problems(result);
  assert.equal(
    lines.some((line) => line.toLowerCase().includes("phantom")),
    false,
    lines.join("\n"),
  );
});
