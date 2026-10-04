// Fail when an OpenAPI operation is unclassified, or the generated table is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const START = "<!-- operation-inventory:start -->";
const END = "<!-- operation-inventory:end -->";
const EMPTY = "—";
const MARKDOWN = "docs/operation-inventory.md";

// One entry per language. `method` captures the façade method name.
// Later layers add Ruby and Go here.
const LANGUAGE_FACADES = [
  {
    language: "typescript",
    heading: "TypeScript façade",
    source: "typescript/src/client.ts",
    method: /^  (?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  },
  {
    language: "python",
    heading: "Python façade",
    source: "python/src/weft_sdk/client.py",
    method: /^    (?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  },
];

const CLASSIFICATIONS = {
  facade: "Facade",
  "cli-only": "CLI-only",
  excluded: "Excluded",
};

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);
// YAML allows the indent digit and chomp mark in either order: `|2+`, `|+2`.
const BLOCK_SCALAR = /^[|>](?:[+-]\d*|\d+[+-]?)?(?:\s+#.*)?$/;
const KEY_LINE = /^(\s*)([A-Za-z_][A-Za-z0-9_-]*):(.*)$/;

export function extractOperationIds(yaml) {
  const ids = [];
  const stack = [];
  let blockIndent = null;

  for (const line of yaml.split(/\r?\n/)) {
    if (blockIndent !== null) {
      if (line.trim() === "") continue;
      if (leadingSpaces(line) > blockIndent) continue;
      blockIndent = null;
    }
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    const match = line.match(KEY_LINE);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2];
    const rest = stripInlineComment(match[3].trim());
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack.length > 0 ? stack[stack.length - 1].key : null;
    stack.push({ indent, key });
    if (BLOCK_SCALAR.test(rest)) {
      blockIndent = indent;
      continue;
    }
    if (key !== "operationId" || !HTTP_METHODS.has(parent)) continue;
    const value = scalarValue(rest);
    if (value) ids.push(value);
  }
  return ids;
}

function leadingSpaces(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function stripInlineComment(value) {
  if (value.startsWith('"') || value.startsWith("'") || !value.includes("#")) {
    return value;
  }
  if (value.startsWith("#")) return "";
  return value.replace(/\s+#.*$/, "").trim();
}

function scalarValue(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function renderOperationTable(inventory) {
  const headings = inventory.languages.map((language) => {
    return (
      LANGUAGE_FACADES.find((entry) => entry.language === language)?.heading ??
      `${language} façade`
    );
  });
  const header = ["operation", ...headings, "CLI", "classification/reason"];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const operation of inventory.operations) {
    const methods = operation.methods ?? {};
    const label =
      CLASSIFICATIONS[operation.classification] ?? operation.classification;
    const reason = typeof operation.reason === "string" ? operation.reason : "";
    lines.push(
      `| ${[
        `\`${operation.operationId}\``,
        ...inventory.languages.map((language) => cell(methods[language])),
        cell(operation.cli),
        `${label}: ${reason}`,
      ].join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

function cell(value) {
  return typeof value === "string" && value.trim() ? `\`${value}\`` : EMPTY;
}

function tableBody(markdown) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start < 0 || end < start) return null;
  let body = markdown.slice(start + START.length, end);
  if (body.startsWith("\r\n")) body = body.slice(2);
  else if (body.startsWith("\n")) body = body.slice(1);
  if (body.endsWith("\r\n")) body = body.slice(0, -2);
  else if (body.endsWith("\n")) body = body.slice(0, -1);
  return body;
}

function spliceTable(markdown, table) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start < 0 || end < start) return null;
  return `${markdown.slice(0, start + START.length)}\n${table}\n${markdown.slice(end)}`;
}

function duplicates(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
}

function readText(path) {
  try {
    return { text: readFileSync(path, "utf8") };
  } catch (error) {
    return { error: error.message };
  }
}

export function checkOperationInventory({
  specPath,
  inventoryPath,
  markdownPath,
  root,
  write = false,
}) {
  const problems = [];
  const spec = readText(specPath);
  const inventoryFile = readText(inventoryPath);
  const markdownFile = readText(markdownPath);
  if (spec.error) problems.push(`cannot read spec: ${spec.error}`);
  if (inventoryFile.error) {
    problems.push(`cannot read inventory: ${inventoryFile.error}`);
  }
  if (markdownFile.error) {
    problems.push(`${MARKDOWN} operation table is out of date`);
  }
  if (spec.error || inventoryFile.error) return problems;

  const specIds = extractOperationIds(spec.text);
  let inventory;
  try {
    inventory = JSON.parse(inventoryFile.text);
  } catch (error) {
    problems.push(`inventory is not valid JSON: ${error.message}`);
    return problems;
  }
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    problems.push("inventory must be an object");
    return problems;
  }
  if (
    !Array.isArray(inventory.languages) ||
    inventory.languages.length === 0 ||
    inventory.languages.some((language) => typeof language !== "string" || !language)
  ) {
    problems.push("inventory languages must be a non-empty array");
    return problems;
  }
  if (!Array.isArray(inventory.operations)) {
    problems.push("inventory operations must be an array");
    return problems;
  }

  const specSet = new Set(specIds);
  const inventoryIds = [];
  for (const [index, operation] of inventory.operations.entries()) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      problems.push(`operation at index ${index} is not an object`);
      inventoryIds.push("");
      continue;
    }
    const id = typeof operation.operationId === "string" ? operation.operationId.trim() : "";
    inventoryIds.push(id);
    if (!id) problems.push(`operation at index ${index} has an empty operationId`);
  }

  for (const id of duplicates(specIds)) {
    problems.push(`operation ${id} appears twice in the spec`);
  }
  for (const id of specSet) {
    if (!inventoryIds.includes(id)) {
      problems.push(`spec operation ${id} is absent from the inventory`);
    }
  }
  for (const id of duplicates(inventoryIds.filter(Boolean))) {
    problems.push(`operation ${id} appears twice in the inventory`);
  }
  for (const id of new Set(inventoryIds.filter(Boolean))) {
    if (!specSet.has(id)) {
      problems.push(`inventory operation ${id} is absent from the spec`);
    }
  }

  for (const language of inventory.languages) {
    if (!LANGUAGE_FACADES.some((entry) => entry.language === language)) {
      problems.push(`language ${language} has no façade source entry`);
    }
  }
  if (new Set(inventory.languages).size !== inventory.languages.length) {
    problems.push("inventory languages contains a duplicate");
  }

  const sourceText = new Map();
  for (const operation of inventory.operations) {
    if (!operation || typeof operation !== "object") continue;
    const id = typeof operation.operationId === "string" ? operation.operationId.trim() : "";
    if (!id) continue;
    if (!Object.hasOwn(CLASSIFICATIONS, operation.classification)) {
      problems.push(
        `operation ${id} has invalid classification ${JSON.stringify(operation.classification)}`,
      );
    }
    if (typeof operation.reason !== "string" || operation.reason.trim() === "") {
      problems.push(`operation ${id} has an empty reason`);
    }
    if (operation.cli !== null && (typeof operation.cli !== "string" || operation.cli.trim() === "")) {
      problems.push(`operation ${id} cli must be a string or null`);
    }
    for (const language of inventory.languages) {
      const name = operation.methods?.[language];
      const named = typeof name === "string" && name.trim() !== "";
      if (operation.classification === "facade" && !named) {
        problems.push(`operation ${id} lacks a ${language} façade method`);
        continue;
      }
      if (!named) continue;
      const entry = LANGUAGE_FACADES.find((item) => item.language === language);
      if (!entry) continue;
      if (!sourceText.has(language)) {
        const source = readText(resolve(root, entry.source));
        sourceText.set(language, source.error ? null : source.text);
        if (source.error) {
          problems.push(
            `cannot read ${language} façade source ${entry.source}: ${source.error}`,
          );
        }
      }
      const text = sourceText.get(language);
      if (text === null) continue;
      if (!methodExists(text, entry, name)) {
        problems.push(
          `${language} façade method ${name} for ${id} is absent from ${entry.source}`,
        );
      }
    }
  }

  if (!markdownFile.error) {
    const rendered = renderOperationTable(inventory);
    const stale = tableBody(markdownFile.text) !== rendered;
    if (write && problems.length === 0) {
      const next = spliceTable(markdownFile.text, rendered);
      if (next === null) {
        problems.push(`${MARKDOWN} operation table is out of date`);
      } else if (next !== markdownFile.text) {
        writeFileSync(markdownPath, next);
      }
    } else if (stale) {
      problems.push(`${MARKDOWN} operation table is out of date`);
    }
  }
  return problems;
}

function methodExists(source, entry, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  return source.split(/\r?\n/).some((line) => line.match(entry.method)?.[1] === name);
}

function parseArgs(argv) {
  const options = { write: false, spec: null, inventory: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--spec" || arg === "--inventory") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { error: `${arg} requires a path` };
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    return { error: `unknown argument ${arg}` };
  }
  return { options };
}

function main() {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }
  const problems = checkOperationInventory({
    specPath: resolve(parsed.options.spec ?? resolve(repoRoot, "spec/openapi.yaml")),
    inventoryPath: resolve(
      parsed.options.inventory ?? resolve(repoRoot, "conformance/operations.json"),
    ),
    markdownPath: resolve(repoRoot, MARKDOWN),
    root: repoRoot,
    write: parsed.options.write,
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
