import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { version as SDK_VERSION } from "../package.json";
import { WeftClient } from "../src/client";
import { WeftError } from "../src/error";
import {
  resolveUrl,
  validateUrl,
  X402_FACILITATOR_URL_ENV,
} from "../src/facilitator/client";
import {
  buildFacilitatorAuthHeaders,
  WEFT_DECLARED_HEADER,
} from "../src/facilitator/middleware/handshake";
import { dynamicExtension } from "../src/facilitator/middleware/extensions";
import { applyProductIdentity } from "../src/facilitator/middleware/product";
import { isFacilitatorUnavailable } from "../src/facilitator/middleware/settlement";
import { BalanceResponseToJSON } from "../src/generated/models/BalanceResponse";
import { FetchResponseToJSON } from "../src/generated/models/FetchResponse";
import { MeResponseToJSON } from "../src/generated/models/MeResponse";
import { PurchaseListResponseToJSON } from "../src/generated/models/PurchaseListResponse";
import { PurchaseResponseToJSON } from "../src/generated/models/PurchaseResponse";
import { SearchResponseToJSON } from "../src/generated/models/SearchResponse";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../conformance");
const ADAPTER = "express";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface ClientCase {
  name: string;
  languages?: string[];
  call: { method: string; args: Record<string, Json> };
  client: { credential?: string; accessToken?: string; baseUrl?: string };
  expectRequest?: {
    method: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    jsonBody?: Json;
  };
  response?: {
    status?: number;
    reason?: string;
    headers?: Record<string, string>;
    body?: Json;
    networkFailure?: boolean;
  };
  expectResult?: Json;
  expectError?: {
    status: number;
    code: string;
    message: string;
    requestId: string | null;
    retryable: boolean;
    details?: Json;
  };
  expectValidationError?: boolean;
}

interface LoadedCase {
  file: string;
  item: ClientCase & Record<string, unknown>;
}

const SERIALIZERS: Record<string, (value: never) => unknown> = {
  me: MeResponseToJSON,
  balance: BalanceResponseToJSON,
  search: SearchResponseToJSON,
  fetch: FetchResponseToJSON,
  purchases: PurchaseListResponseToJSON,
  purchase: PurchaseResponseToJSON,
};

function loadCases(directory: string): LoadedCase[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      const parsed: unknown = JSON.parse(
        readFileSync(join(directory, file), "utf8"),
      );
      if (!Array.isArray(parsed)) {
        throw new Error(`${file} must be an array of cases`);
      }
      return parsed.map((item) => ({ file, item: item as LoadedCase["item"] }));
    });
}

function selected(languages: string[] | undefined): boolean {
  return languages === undefined || languages.includes("typescript");
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function substitute(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll("$ADAPTER", ADAPTER)
      .replaceAll("$SDK_VERSION", SDK_VERSION);
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item)]),
    );
  }
  return value;
}

function wireResult(method: string, result: unknown): unknown {
  const serialize = SERIALIZERS[method];
  if (!serialize) throw new Error(`no serializer for ${method}`);
  const wire = JSON.parse(JSON.stringify(serialize(result as never))) as {
    data?: { principalType?: string; principal_type?: string };
  };
  if (method === "me" && wire.data && "principalType" in wire.data) {
    expect(wire.data.principalType).toBe(wire.data.principal_type);
    delete wire.data.principalType;
  }
  return wire;
}

function classifyProductWarning(message: string): string {
  const text = message.replace(/^\[weft\] /, "");
  if (
    text.includes("route serviceName") ||
    text.includes("product name") ||
    text.startsWith("ignoring name")
  ) {
    return "name";
  }
  if (text.includes("route type") || text.startsWith("ignoring type")) {
    return "type";
  }
  if (text.includes("tag")) return "tags";
  if (text.includes("iconUrl")) return "iconUrl";
  if (text.includes("productId")) return "productId";
  if (text.includes("manifestHash")) return "manifestHash";
  if (text.includes("dimension")) return "dimensions";
  if (text.includes("route extensions")) return "extensions";
  if (text.startsWith("ignoring route")) return "route";
  throw new Error(`unclassified product warning: ${text}`);
}

function classifyExtensionWarning(message: string): string {
  const text = message.replace(/^\[weft\] /, "");
  const match = /^extensions\[([^\]]+)\]/.exec(text);
  if (!match) throw new Error(`unclassified extension warning: ${text}`);
  const key = match[1];
  if (text.includes("over the")) return `${key}:over-cap`;
  if (text.includes("JSON cannot carry")) return `${key}:unserializable`;
  if (text.includes("callback failed")) return `${key}:threw`;
  if (text.includes("no HTTP request")) return `${key}:no-request`;
  if (text.includes("returned")) return `${key}:not-an-object`;
  throw new Error(`unclassified extension warning: ${text}`);
}

function captureWarnings(run: () => void): string[] {
  const warnings: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return warnings;
}

function canonicalDeclared(json: Record<string, unknown>): string {
  const payload: Record<string, unknown> = {};
  for (const key of ["name", "type", "tags", "icon_url", "dimensions"]) {
    if (key in json) payload[key] = json[key];
  }
  return JSON.stringify(payload);
}

function encodeDeclared(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeDeclared(value: string): unknown {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (padded.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded + pad, "base64").toString("utf8"));
}

function materialize(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "$fixture" in value
  ) {
    const kind = String((value as { $fixture: string }).$fixture);
    if (kind === "circular") {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      return circular;
    }
    if (kind === "nan-field") return { n: Number.NaN };
    if (kind === "non-finite-body") {
      return {
        n: Number.NaN,
        inf: Number.POSITIVE_INFINITY,
        neg: Number.NEGATIVE_INFINITY,
        nested: { n: Number.NaN },
        items: [Number.NaN, Number.POSITIVE_INFINITY, 1],
      };
    }
    throw new Error(`unknown fixture value ${kind}`);
  }
  return value;
}

function materializeClientValue(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "$fixture" in value
  ) {
    return materialize(value);
  }
  if (Array.isArray(value)) return value.map((item) => materializeClientValue(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, materializeClientValue(item)]),
    );
  }
  return value;
}

const clientCases = loadCases(join(ROOT, "client"));
const facilitatorCases = loadCases(join(ROOT, "facilitator"));

describe("conformance client", () => {
  it("loads every client fixture", () => {
    expect(clientCases.length).toBeGreaterThan(0);
  });

  for (const loaded of clientCases) {
    const testCase = loaded.item as ClientCase;
    const run = selected(testCase.languages) ? it : it.skip;
    run(`${loaded.file}: ${testCase.name}`, async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchApi = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        if (testCase.response?.networkFailure) {
          throw new TypeError("connection reset");
        }
        const raw = testCase.response?.body;
        const body = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
        return new Response(body, {
          status: testCase.response?.status ?? 200,
          headers: testCase.response?.headers,
        });
      };

      const build = () => {
        const spec = testCase.client;
        const base = spec.baseUrl === undefined ? {} : { baseUrl: spec.baseUrl };
        const hasKey = "credential" in spec;
        const hasToken = "accessToken" in spec;
        if (hasKey && hasToken) {
          return new WeftClient({
            apiKey: spec.credential,
            accessToken: spec.accessToken,
            ...base,
            fetchApi,
          } as never);
        }
        if (hasToken) {
          return new WeftClient({
            accessToken: spec.accessToken ?? "",
            ...base,
            fetchApi,
          });
        }
        if (hasKey) {
          return new WeftClient({
            apiKey: spec.credential ?? "",
            ...base,
            fetchApi,
          });
        }
        return new WeftClient({ ...base, fetchApi } as never);
      };

      const invoke = async (client: WeftClient) => {
        const method = testCase.call.method;
        const args = testCase.call.args ?? {};
        if (method === "me") return client.me();
        if (method === "balance") return client.balance();
        if (method === "search") {
          return client.search(args.request as never);
        }
        if (method === "fetch") {
          return client.fetch(
            materializeClientValue(args.request) as never,
            args.options as never,
          );
        }
        if (method === "purchases") {
          return client.purchases((args.options ?? {}) as never);
        }
        if (method === "purchase") return client.purchase(args.id as number);
        throw new Error(`unknown call ${method}`);
      };

      if (testCase.expectValidationError) {
        await expect(async () => invoke(build())).rejects.toThrow();
        expect(calls).toEqual([]);
        return;
      }

      const client = build();
      if (testCase.expectError) {
        let thrown: unknown;
        try {
          await invoke(client);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(WeftError);
        const error = thrown as WeftError;
        expect(error.status).toBe(testCase.expectError.status);
        expect(error.code).toBe(testCase.expectError.code);
        expect(error.message).toBe(testCase.expectError.message);
        expect(error.requestId ?? null).toBe(testCase.expectError.requestId);
        expect(error.retryable).toBe(testCase.expectError.retryable);
        if ("details" in testCase.expectError) {
          if (testCase.expectError.details === null) {
            expect(error.details).toBeUndefined();
          } else {
            expect(error.details).toEqual(testCase.expectError.details);
          }
        }
      } else {
        const result = await invoke(client);
        expect(wireResult(testCase.call.method, result)).toEqual(
          testCase.expectResult,
        );
      }

      if (!testCase.expectRequest) return;
      expect(calls).toHaveLength(1);
      const call = calls[0];
      const url = new URL(call.url);
      const base = stripTrailingSlashes(
        testCase.client.baseUrl ?? "https://weft.network",
      );
      expect(url.origin + url.pathname).toBe(base + testCase.expectRequest.path);
      expect(call.init.method).toBe(testCase.expectRequest.method);
      expect(Object.fromEntries(url.searchParams.entries())).toEqual(
        testCase.expectRequest.query,
      );
      const headers = new Headers(call.init.headers);
      for (const [name, value] of Object.entries(testCase.expectRequest.headers)) {
        expect(headers.get(name)).toBe(value);
      }
      if (testCase.call.method !== "fetch") {
        expect(headers.get("idempotency-key")).toBeNull();
      }
      if ("jsonBody" in testCase.expectRequest) {
        expect(JSON.parse(String(call.init.body))).toEqual(
          testCase.expectRequest.jsonBody,
        );
      } else {
        expect(call.init.body ?? null).toBeNull();
      }
    });
  }
});

describe("conformance facilitator", () => {
  it("loads every facilitator fixture", () => {
    expect(facilitatorCases.length).toBeGreaterThan(0);
  });

  for (const loaded of facilitatorCases) {
    const testCase = loaded.item;
    const run = selected(testCase.languages as string[] | undefined) ? it : it.skip;
    run(`${loaded.file}: ${String(testCase.name)}`, async () => {
      if (loaded.file === "auth-headers.json") {
        await assertAuthHeaders(testCase);
        return;
      }
      if (loaded.file === "declared-header.json") {
        assertDeclaredHeader(testCase);
        return;
      }
      if (loaded.file === "product-identity.json") {
        assertProductIdentity(testCase);
        return;
      }
      if (loaded.file === "request-extension.json") {
        await assertRequestExtension(testCase);
        return;
      }
      if (loaded.file === "facilitator-url.json") {
        assertFacilitatorUrl(testCase);
        return;
      }
      if (loaded.file === "settlement.json") {
        const reason = testCase.reason;
        expect(isFacilitatorUnavailable(reason === null ? undefined : String(reason))).toBe(
          testCase.expect,
        );
        return;
      }
      if (loaded.file === "route-match.json") {
        expect(coreRouteMatches(testCase)).toBe(testCase.match);
        return;
      }
      if (loaded.file === "requirements-match.json") {
        expect(coreRequirementsMatch(testCase)).toBe(testCase.match);
        return;
      }
      throw new Error(`no facilitator runner for ${loaded.file}`);
    });
  }
});

type CoreRouteServer = {
  parseRoutePattern(pattern: string): { verb: string; regex: RegExp; path: string };
  normalizePath(path: string): string;
};

const coreRoutes = new x402HTTPResourceServer(new x402ResourceServer(), {
  "*": { accepts: [] },
}) as unknown as CoreRouteServer;

function coreRouteMatches(testCase: Record<string, unknown>): boolean {
  const parsed = coreRoutes.parseRoutePattern(String(testCase.pattern));
  const normalized = coreRoutes.normalizePath(String(testCase.path));
  const method = String(testCase.method).toUpperCase();
  return parsed.regex.test(normalized) && (parsed.verb === "*" || parsed.verb === method);
}

const coreRequirements = new x402ResourceServer();

function coreRequirementsMatch(testCase: Record<string, unknown>): boolean {
  const matched = coreRequirements.findMatchingRequirements(
    [testCase.required as never],
    {
      x402Version: 2,
      payload: {},
      accepted: testCase.accepted as never,
    },
  );
  return matched !== undefined;
}

async function assertAuthHeaders(testCase: Record<string, unknown>): Promise<void> {
  const args = substitute(testCase.args) as {
    adapter: "express";
    apiKey?: unknown;
    declaration: Record<string, unknown>;
  };
  const expectHeaders = substitute(testCase.expect) as {
    supported: Record<string, string>;
    settle: Record<string, string> | null;
    verify: Record<string, string> | null;
    declared: boolean;
    warnings: number;
    absentFromLogs?: string[];
  };
  const warnings = captureWarnings(() => {
    const headers = buildFacilitatorAuthHeaders(
      args.adapter,
      "apiKey" in args ? args.apiKey : undefined,
      args.declaration,
    );
    expect(headers.supported).toEqual({
      ...expectHeaders.supported,
      ...(expectHeaders.declared
        ? { [WEFT_DECLARED_HEADER]: headers.supported[WEFT_DECLARED_HEADER] }
        : {}),
    });
    if (expectHeaders.declared) {
      expect(headers.supported[WEFT_DECLARED_HEADER]).toEqual(expect.any(String));
      expect(String(headers.supported[WEFT_DECLARED_HEADER]).length).toBeGreaterThan(0);
    } else {
      expect(headers.supported[WEFT_DECLARED_HEADER]).toBeUndefined();
    }
    expect(headers.settle ?? null).toEqual(expectHeaders.settle);
    expect(headers.verify ?? null).toEqual(expectHeaders.verify);
    expect(Object.keys(headers).sort()).toEqual(
      ["settle", "supported", "verify"].filter((key) => {
        if (key === "supported") return true;
        return expectHeaders[key as "settle" | "verify"] !== null;
      }).sort(),
    );
  });
  expect(warnings).toHaveLength(expectHeaders.warnings);
  for (const secret of expectHeaders.absentFromLogs ?? []) {
    expect(warnings.some((line) => line.includes(secret))).toBe(false);
  }
}

function assertDeclaredHeader(testCase: Record<string, unknown>): void {
  const declaration = testCase.declaration as Record<string, unknown>;
  const expected = testCase.expect as {
    present: boolean;
    json?: Record<string, unknown>;
    warningKeys: string[];
  };
  const warnings = captureWarnings(() => {
    const headers = buildFacilitatorAuthHeaders("express", null, declaration);
    const encoded = headers.supported[WEFT_DECLARED_HEADER];
    if (!expected.present) {
      expect(encoded).toBeUndefined();
      return;
    }
    expect(encoded).toEqual(expect.any(String));
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeDeclared(encoded)).toEqual(expected.json);
    expect(encoded).toBe(encodeDeclared(canonicalDeclared(expected.json ?? {})));
  });
  expect(warnings.map(classifyProductWarning).sort()).toEqual(
    [...expected.warningKeys].sort(),
  );
}

function assertProductIdentity(testCase: Record<string, unknown>): void {
  const routes = testCase.routes as never;
  const declaration = testCase.declaration as never;
  const expected = testCase.expect as {
    unchanged?: boolean;
    routes?: unknown;
    route?: unknown;
    rejected: string[];
  };
  const warnings = captureWarnings(() => {
    const result = applyProductIdentity(routes, declaration);
    if (expected.unchanged) {
      expect(result).toBe(routes);
      return;
    }
    expect(result).toEqual(expected.route ?? expected.routes);
  });
  expect([...new Set(warnings.map(classifyProductWarning))].sort()).toEqual(
    [...expected.rejected].sort(),
  );
}

async function assertRequestExtension(
  testCase: Record<string, unknown>,
): Promise<void> {
  const key = String(testCase.key);
  const expected = testCase.expect as {
    dropped: boolean;
    shipped?: unknown;
    warningKeys: string[];
    remaining?: Record<string, unknown>;
  };
  const extensions = {
    ...(testCase.extensions as Record<string, unknown>),
    [key]: async () => materialize(testCase.resolved),
  };
  const context = {
    paymentRequiredResponse: { extensions },
    transportContext: { request: {} },
  };
  const warnings: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  try {
    const hook = dynamicExtension(key, (message, dedupeKey) => {
      warnings.push(`[weft] ${message}`);
      void dedupeKey;
    });
    const shipped = await hook.enrichPaymentRequiredResponse?.(
      extensions[key],
      context as never,
    );
    if (expected.dropped) {
      expect(shipped).toBeUndefined();
      expect(extensions[key]).toBeUndefined();
      if (expected.remaining) {
        expect(extensions).toEqual(expected.remaining);
      }
    } else {
      expect(shipped).toEqual(expected.shipped);
    }
  } finally {
    spy.mockRestore();
  }
  expect(warnings.map(classifyExtensionWarning).sort()).toEqual(
    [...expected.warningKeys].sort(),
  );
}

function assertFacilitatorUrl(testCase: Record<string, unknown>): void {
  const args = testCase.args as {
    config?: { url?: string };
    env?: Record<string, string>;
    url?: string;
  };
  const previous = process.env[X402_FACILITATOR_URL_ENV];
  if (args.env?.[X402_FACILITATOR_URL_ENV]) {
    process.env[X402_FACILITATOR_URL_ENV] = args.env[X402_FACILITATOR_URL_ENV];
  } else {
    delete process.env[X402_FACILITATOR_URL_ENV];
  }
  try {
    if (testCase.fn === "resolveUrl") {
      expect(resolveUrl(args.config)).toBe(testCase.expect);
      return;
    }
    if (testCase.fn === "validateUrl") {
      if (testCase.expectError === true) {
        expect(() => validateUrl(args.url ?? "")).toThrow();
      } else {
        expect(() => validateUrl(args.url ?? "")).not.toThrow();
      }
      return;
    }
    throw new Error(`unknown facilitator url function ${String(testCase.fn)}`);
  } finally {
    if (previous === undefined) delete process.env[X402_FACILITATOR_URL_ENV];
    else process.env[X402_FACILITATOR_URL_ENV] = previous;
  }
}
