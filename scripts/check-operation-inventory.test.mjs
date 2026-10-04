import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkOperationInventory,
  extractOperationIds,
} from "./check-operation-inventory.mjs";

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
  assert.deepEqual(inventory.languages, ["typescript", "python", "ruby", "go"]);
  assert.deepEqual(
    inventory.operations.map((operation) => operation.operationId),
    specOperations,
  );
  assert.equal(
    JSON.stringify(inventory).includes("getCuratedMarketplaceContract"),
    false,
  );
  assert.equal(
    inventory.operations.some(
      (operation) =>
        operation.classification === "cli-only" ||
        Object.hasOwn(operation, "cli"),
    ),
    false,
  );
  assert.deepEqual(
    inventory.operations
      .filter((operation) => operation.reason === "CLI-only (weftlabs/weft-cli)")
      .map((operation) => operation.operationId),
    ["createAccountBootstrap", "getAccountBootstrap"],
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

test("flow mappings and quoted keys are operations", () => {
  const spec = [
    "openapi: 3.1.0",
    "paths:",
    "  /flow:",
    "    post: {operationId: flowOperation}",
    '  "/quoted":',
    '    "get":',
    "      operationId: 'quotedOperation'",
    "",
  ].join("\n");
  assert.deepEqual(extractOperationIds(spec), [
    "flowOperation",
    "quotedOperation",
  ]);
});

test("an unreadable inventory table reports the read error", () => {
  const dir = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  const markdownPath = join(dir, "docs/operation-inventory.md");
  try {
    const found = checkOperationInventory({
      specPath,
      inventoryPath,
      markdownPath,
      root: repoRoot,
    });
    assert.ok(
      found.some((line) =>
        line.startsWith("cannot read docs/operation-inventory.md:"),
      ),
      found.join("\n"),
    );
    assert.equal(
      found.some((line) => line.includes("out of date")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an operation without operationId fails", () => {
  const { dir, path } = withCopy(specPath, (spec) =>
    spec.replace("      operationId: getPurchase\n", ""),
  );
  const result = finish(dir, run(["--spec", path]));
  const lines = problems(result);
  assert.notEqual(result.status, 0);
  assert.ok(
    lines.includes("operation GET /api/v1/purchases/{id} has no operationId"),
    lines.join("\n"),
  );
  assert.equal(
    lines.at(-1),
    "Fix: classify every operation in conformance/operations.json, then run node scripts/check-operation-inventory.mjs --write",
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
    '      summary: "text operationId: phantomFromSummary"',
    "      description: |",
    "        The word operationId appears in this description.",
    "        operationId: phantomFromBlock",
    "        post:",
    "          operationId: phantomNestedInDescription",
    "      x-explicit: |2+",
    "        post:",
    "          operationId: phantomNestedInIndentChomp",
    "      x-fold: >2-",
    "        operationId: phantomFromFoldChomp",
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
    '          description: "operationId: phantomFromPropertyText"',
    "",
  ].join("\n");
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

test("a call site does not count as a façade method", () => {
  const dir = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  mkdirSync(join(dir, "typescript/src"), { recursive: true });
  mkdirSync(join(dir, "python/src/weft_sdk"), { recursive: true });
  const fixtureSpec = join(dir, "openapi.yaml");
  const fixtureInventory = join(dir, "operations.json");
  const markdownPath = join(dir, "inventory.md");
  writeFileSync(
    fixtureSpec,
    ["paths:", "  /example:", "    post:", "      operationId: fetch", ""].join(
      "\n",
    ),
  );
  writeFileSync(
    fixtureInventory,
    JSON.stringify({
      languages: ["typescript", "python"],
      operations: [
        {
          operationId: "fetch",
          classification: "facade",
          methods: { typescript: "fetch", python: "fetch" },
          reason: "fixture",
        },
      ],
    }),
  );
  writeFileSync(markdownPath, "prose\n");
  writeFileSync(
    join(dir, "typescript/src/client.ts"),
    [
      "export class WeftClient {",
      "  helper() {",
      "    fetch(",
      "      request,",
      "    );",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "python/src/weft_sdk/client.py"),
    [
      "class Client:",
      "    def helper(self):",
      "        def fetch(self):",
      "            return None",
      "",
    ].join("\n"),
  );
  try {
    const found = checkOperationInventory({
      specPath: fixtureSpec,
      inventoryPath: fixtureInventory,
      markdownPath,
      root: dir,
    });
    assert.ok(
      found.includes(
        "typescript façade method fetch for fetch is absent from typescript/src/client.ts",
      ),
      found.join("\n"),
    );
    assert.ok(
      found.includes(
        "python façade method fetch for fetch is absent from python/src/weft_sdk/client.py",
      ),
      found.join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--write replaces only the marked table", () => {
  const dir = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  const fixtureSpec = join(dir, "openapi.yaml");
  const fixtureInventory = join(dir, "operations.json");
  const markdownPath = join(dir, "inventory.md");
  const before = "Prose before the table.\n\n";
  const after = "\n\nProse after the table.\n";
  writeFileSync(
    fixtureSpec,
    ["paths:", "  /example:", "    get:", "      operationId: getWidget", ""].join(
      "\n",
    ),
  );
  writeFileSync(
    fixtureInventory,
    JSON.stringify({
      languages: ["typescript", "python"],
      operations: [
        {
          operationId: "getWidget",
          classification: "excluded",
          reason: "fixture",
        },
      ],
    }),
  );
  writeFileSync(
    markdownPath,
    `${before}<!-- operation-inventory:start -->\n| stale |\n<!-- operation-inventory:end -->${after}`,
  );
  try {
    const found = checkOperationInventory({
      specPath: fixtureSpec,
      inventoryPath: fixtureInventory,
      markdownPath,
      root: dir,
      write: true,
    });
    assert.deepEqual(found, []);
    const next = readFileSync(markdownPath, "utf8");
    assert.equal(next.startsWith(before), true);
    assert.equal(next.endsWith(after), true);
    assert.equal(next.includes("| stale |"), false);
    assert.equal(next.includes("`getWidget`"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--write does not change markdown when the inventory does not match the spec", () => {
  const dir = mkdtempSync(join(tmpdir(), "operation-inventory-"));
  const fixtureSpec = join(dir, "openapi.yaml");
  const fixtureInventory = join(dir, "operations.json");
  const markdownPath = join(dir, "inventory.md");
  const original =
    "Prose before.\n\n<!-- operation-inventory:start -->\n| keep |\n<!-- operation-inventory:end -->\n\nProse after.\n";
  writeFileSync(
    fixtureSpec,
    ["paths:", "  /example:", "    get:", "      operationId: other", ""].join("\n"),
  );
  writeFileSync(
    fixtureInventory,
    JSON.stringify({
      languages: ["typescript", "python"],
      operations: [
        {
          operationId: "getWidget",
          classification: "excluded",
          reason: "fixture",
        },
      ],
    }),
  );
  writeFileSync(markdownPath, original);
  try {
    const found = checkOperationInventory({
      specPath: fixtureSpec,
      inventoryPath: fixtureInventory,
      markdownPath,
      root: dir,
      write: true,
    });
    assert.notEqual(found.length, 0);
    assert.equal(readFileSync(markdownPath, "utf8"), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a cli field or cli-only classification fails", () => {
  const withCli = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "signIn",
    );
    operation.cli = "weft sign-in";
    return JSON.stringify(inventory);
  });
  const cliField = finish(
    withCli.dir,
    run(["--inventory", withCli.path]),
  );
  assert.notEqual(cliField.status, 0);
  assert.ok(
    problems(cliField).includes(
      "operation signIn must not include a cli field",
    ),
  );

  const withClassification = withCopy(inventoryPath, (raw) => {
    const inventory = JSON.parse(raw);
    const operation = inventory.operations.find(
      (item) => item.operationId === "signIn",
    );
    operation.classification = "cli-only";
    return JSON.stringify(inventory);
  });
  const classification = finish(
    withClassification.dir,
    run(["--inventory", withClassification.path]),
  );
  assert.notEqual(classification.status, 0);
  assert.ok(
    problems(classification).includes(
      'operation signIn has invalid classification "cli-only"',
    ),
  );
});
