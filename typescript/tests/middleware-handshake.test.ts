import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { version as SDK_VERSION } from "../package.json";
import {
  weftPaymentMiddleware,
  type WeftExpressMiddlewareConfig,
} from "../src/facilitator/middleware/express";
import {
  weftPaymentMiddlewareHono,
  type WeftHonoMiddlewareConfig,
} from "../src/facilitator/middleware/hono";
import {
  buildFacilitatorAuthHeaders,
  WEFT_API_KEY_HEADER,
  WEFT_DECLARED_HEADER,
} from "../src/facilitator/middleware/handshake";
import { applyProductIdentity } from "../src/facilitator/middleware/product";
import { createFacilitatorClient } from "../src/facilitator/client";
import { x402Client } from "@x402/core/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type {
  Network,
  PaymentRequirements,
  SchemeNetworkClient,
  SchemeNetworkServer,
} from "@x402/core/types";
import type { WeftRoutesConfig } from "../src/facilitator/middleware/product";

/**
 * Coverage for the construction-time facilitator handshake.
 *
 * The middleware has always called `/supported` at construction to sync
 * supported payment kinds. These tests pin what that call now carries —
 * `Authorization`, `User-Agent`, `X-Weft-Declared` — and what it must never
 * do: block, brick, or crash a seller's server, whatever the facilitator's
 * state.
 */

const NETWORK: Network = "eip155:84532";
const FACILITATOR_URL = "https://facilitator.test";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const fakeScheme: SchemeNetworkServer = {
  scheme: "exact",
  defaultAssetTransferMethod: "authorization",
  paymentFlows: {
    authorization: { supported: ["authorization"], default: "authorization" },
  },
  async parsePrice() {
    return { amount: "10000", asset: ASSET };
  },
  async enhancePaymentRequirements(requirements: PaymentRequirements) {
    return requirements;
  },
};

const routes: WeftRoutesConfig = {
  "GET /v1/search": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: PAY_TO,
      price: "$0.01",
    },
  },
};

const baseConfig = {
  facilitator: { url: FACILITATOR_URL },
  schemes: [{ network: NETWORK, server: fakeScheme }],
} satisfies WeftExpressMiddlewareConfig & WeftHonoMiddlewareConfig;

const SUPPORTED_BODY = JSON.stringify({
  kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
  extensions: [],
  signers: {},
});

/** One recorded facilitator request. */
interface RecordedFetch {
  url: string;
  headers: Record<string, string>;
}

/** Requests the stubbed facilitator received, in order. */
let recorded: RecordedFetch[];

/**
 * Stub `fetch` with a facilitator whose `/supported` behaviour is scripted.
 *
 * @param respond - Produces the response for each `/supported` call
 */
function stubFacilitator(respond: () => Promise<Response>): void {
  recorded = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(init?.headers ?? {})) {
        headers[name.toLowerCase()] = String(value);
      }
      recorded.push({ url: String(url), headers });

      if (!String(url).endsWith("/supported")) {
        throw new Error(`unexpected fetch: ${String(url)}`);
      }
      return respond();
    }),
  );
}

/** Stub a healthy facilitator. */
function stubHealthyFacilitator(): void {
  stubFacilitator(async () => new Response(SUPPORTED_BODY, { status: 200 }));
}

/**
 * Decode an `X-Weft-Declared` header value back into the declared identity.
 *
 * @param value - The base64url header value
 * @returns The declared identity payload
 */
function decodeDeclared(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

/**
 * Drive the Express middleware once and capture what happened.
 *
 * @param middleware - The middleware under test
 * @param path - Request path to drive
 * @returns The captured status, response headers, and `next` mock
 */
async function driveExpress(
  middleware: ReturnType<typeof weftPaymentMiddleware>,
  path = "/v1/search",
) {
  const headers: Record<string, string> = { host: "api.acme.test" };
  const req = {
    method: "GET",
    path,
    protocol: "https",
    headers,
    query: {},
    header: (name: string) => headers[name.toLowerCase()],
  };

  const captured = { status: 0, headers: {} as Record<string, string> };
  const res = {
    statusCode: 0,
    status(code: number) {
      captured.status = code;
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
      return res;
    },
    send: () => res,
    json: () => res,
    writeHead: () => res,
    write: () => true,
    end: () => res,
    getHeaders: () => captured.headers,
    flushHeaders: () => undefined,
  };

  const next = vi.fn();
  await middleware(req, res, next);
  return { ...captured, next };
}

/**
 * Construct an Express middleware and drive one unpaid protected request,
 * flushing the construction-time handshake on the way.
 *
 * @param config - Middleware configuration
 * @returns The `/supported` request the facilitator saw
 */
async function handshakeSeenBy(
  config: WeftExpressMiddlewareConfig,
): Promise<RecordedFetch> {
  const middleware = weftPaymentMiddleware(routes, config);
  await driveExpress(middleware);

  const supported = recorded.find((request) =>
    request.url.endsWith("/supported"),
  );
  expect(supported).toBeDefined();
  return supported as RecordedFetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("handshake headers on the /supported call", () => {
  beforeEach(() => {
    stubHealthyFacilitator();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("carries Authorization, User-Agent and the declared identity", async () => {
    const supported = await handshakeSeenBy({
      ...baseConfig,
      apiKey: "wk_live_abc123",
      name: "Acme Pricing API",
      type: "api",
      tags: ["finance", "pricing"],
      iconUrl: "https://acme.test/icon.png",
    });

    expect(supported.headers.authorization).toBe("Bearer wk_live_abc123");
    expect(supported.headers["user-agent"]).toBe(
      `weft-sdk-express/${SDK_VERSION}`,
    );
    expect(decodeDeclared(supported.headers["x-weft-declared"])).toEqual({
      name: "Acme Pricing API",
      type: "api",
      tags: ["finance", "pricing"],
      icon_url: "https://acme.test/icon.png",
    });
  });

  it("names the Hono adapter in User-Agent", async () => {
    const middleware = weftPaymentMiddlewareHono(routes, {
      ...baseConfig,
      apiKey: "wk_live_abc123",
    });

    const c = {
      req: {
        method: "GET",
        path: "/v1/search",
        url: "https://api.acme.test/v1/search",
        header: () => undefined,
        query: (() => ({})) as never,
        json: async () => undefined,
      },
      res: undefined as Response | undefined,
      header: () => undefined,
      html: (body: string, status?: number) =>
        new Response(body, { status: status ?? 200 }),
      json: (body: unknown, status?: number) =>
        new Response(JSON.stringify(body), { status: status ?? 200 }),
    };
    await middleware(c, async () => undefined);

    const supported = recorded.find((request) =>
      request.url.endsWith("/supported"),
    );
    expect(supported?.headers["user-agent"]).toBe(
      `weft-sdk-hono/${SDK_VERSION}`,
    );
  });

  it("sends no Authorization and no X-Weft-Declared when nothing was configured", async () => {
    const supported = await handshakeSeenBy(baseConfig);

    expect(supported.headers.authorization).toBeUndefined();
    expect(supported.headers["x-weft-declared"]).toBeUndefined();
    expect(supported.headers["user-agent"]).toBe(
      `weft-sdk-express/${SDK_VERSION}`,
    );
  });

  it("declares the same clamped identity the challenge will carry", async () => {
    const supported = await handshakeSeenBy({
      ...baseConfig,
      name: "Acme Real Estate Property Records API",
      type: "Real Time Data Feed" as never,
      tags: ["weft:type:mcp", "finance", "x".repeat(33)],
    });

    expect(decodeDeclared(supported.headers["x-weft-declared"])).toEqual({
      name: "Acme Real Estate Property Record",
      tags: ["finance"],
    });
  });

  it("omits X-Weft-Declared entirely when nothing declared survives sanitization", async () => {
    const supported = await handshakeSeenBy({
      ...baseConfig,
      name: "Acme Café",
    });

    expect(supported.headers["x-weft-declared"]).toBeUndefined();
  });

  it("ignores a malformed apiKey without ever logging its value", async () => {
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });

    const supported = await handshakeSeenBy({
      ...baseConfig,
      apiKey: "   ",
    });

    expect(supported.headers.authorization).toBeUndefined();
    expect(warnings.some((line) => line.includes("apiKey"))).toBe(true);
  });

  /**
   * The leak path this guards: a key with an interior invalid character used
   * to survive to `headers["Authorization"]`, undici rejected the header with
   * a TypeError quoting the full value, and upstream `initialize()` printed
   * that error — a live credential in the seller's boot output, through a
   * code path the SDK does not own. The only fix is to refuse the key before
   * it can become a header.
   */
  it("keeps a key with interior invalid header characters out of headers and logs", async () => {
    const secret = "wk_live_SECRET_KEY\ninterior";
    const logged: string[] = [];
    for (const level of ["warn", "error", "log"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }

    const supported = await handshakeSeenBy({
      ...baseConfig,
      apiKey: secret,
    });

    // The handshake still goes out — anonymously.
    expect(supported.headers.authorization).toBeUndefined();
    expect(supported.headers["user-agent"]).toBe(
      `weft-sdk-express/${SDK_VERSION}`,
    );
    // No log line, ours or anyone's, contains any part of the key.
    expect(logged.some((line) => line.includes("wk_live_SECRET_KEY"))).toBe(
      false,
    );
    expect(logged.some((line) => line.includes("apiKey"))).toBe(true);
  });
});

describe("handshake merges with a seller's own createAuthHeaders", () => {
  beforeEach(() => {
    stubHealthyFacilitator();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("lets the seller's supported headers win over the derived ones", async () => {
    const supported = await handshakeSeenBy({
      ...baseConfig,
      apiKey: "wk_live_abc123",
      facilitator: {
        url: FACILITATOR_URL,
        createAuthHeaders: async () => ({
          supported: { Authorization: "Bearer seller-token" },
        }),
      },
    });

    expect(supported.headers.authorization).toBe("Bearer seller-token");
    expect(supported.headers["user-agent"]).toBe(
      `weft-sdk-express/${SDK_VERSION}`,
    );
  });

  it("passes a seller's verify headers through untouched", async () => {
    const client = createFacilitatorClient(
      {
        url: FACILITATOR_URL,
        createAuthHeaders: async () => ({
          verify: { Authorization: "Bearer verify-token" },
        }),
      },
      { supported: { "User-Agent": "weft-sdk-express/test" } },
    );

    // This call passes no derived verify header, so the seller's verify
    // headers are the whole story. When an apiKey is configured the SDK now
    // derives an `X-API-Key` here so the facilitator can attribute the funnel,
    // and the seller still wins — see the apiKey attribution tests below.
    expect((await client.createAuthHeaders("verify")).headers).toEqual({
      Authorization: "Bearer verify-token",
    });
    expect((await client.createAuthHeaders("supported")).headers).toEqual({
      "User-Agent": "weft-sdk-express/test",
    });
  });

  it("lets the seller win case-insensitively, sending exactly one credential", async () => {
    const client = createFacilitatorClient(
      {
        url: FACILITATOR_URL,
        createAuthHeaders: async () => ({
          supported: { authorization: "Bearer seller-token" },
        }),
      },
      {
        supported: {
          Authorization: "Bearer weft-key",
          "User-Agent": "weft-sdk-express/test",
        },
      },
    );

    const { headers } = await client.createAuthHeaders("supported");

    // A plain spread would keep both spellings; undici folds those into one
    // comma-joined header and the facilitator sees a garbled credential.
    expect(headers).toEqual({
      authorization: "Bearer seller-token",
      "User-Agent": "weft-sdk-express/test",
    });
    expect(new Headers(headers).get("authorization")).toBe(
      "Bearer seller-token",
    );
  });

  it("still rejects a flat createAuthHeaders object loudly", async () => {
    const client = createFacilitatorClient(
      {
        url: FACILITATOR_URL,
        createAuthHeaders: (async () => ({
          Authorization: "Bearer flat",
        })) as never,
      },
      { supported: { "User-Agent": "weft-sdk-express/test" } },
    );

    await expect(client.createAuthHeaders("supported")).rejects.toThrow(
      /keyed by facilitator path/,
    );
  });
});

describe("the handshake never takes a seller's server down with it", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("constructs and passes unprotected traffic while the facilitator is down", async () => {
    stubFacilitator(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      name: "Acme Pricing API",
      type: "api",
    });
    // Let the failed handshake settle; a rejection with no handler attached
    // here would fail this test file as an unhandled error.
    await new Promise((resolve) => setImmediate(resolve));

    const { next } = await driveExpress(middleware, "/healthz");
    expect(next).toHaveBeenCalledWith();
  });

  it("warns once about the failed sync instead of throwing", async () => {
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    stubFacilitator(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    weftPaymentMiddleware(routes, baseConfig);
    await new Promise((resolve) => setImmediate(resolve));

    expect(
      warnings.filter((line) => line.includes("facilitator sync failed")),
    ).toHaveLength(1);
  });

  it("hands a protected request to next(error) instead of crashing when the facilitator is down", async () => {
    stubFacilitator(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const middleware = weftPaymentMiddleware(routes, baseConfig);
    await new Promise((resolve) => setImmediate(resolve));

    const { next } = await driveExpress(middleware);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("serves 402s again once the facilitator recovers, without a restart", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let facilitatorUp = false;
    stubFacilitator(async () => {
      if (!facilitatorUp) {
        throw new Error("connect ECONNREFUSED");
      }
      return new Response(SUPPORTED_BODY, { status: 200 });
    });

    const middleware = weftPaymentMiddleware(routes, baseConfig);
    await new Promise((resolve) => setImmediate(resolve));

    // Down: the protected route degrades to next(error).
    const degraded = await driveExpress(middleware);
    expect(degraded.next).toHaveBeenCalledTimes(1);

    facilitatorUp = true;
    // Step past the retry floor so the next request may kick a re-sync;
    // another request can still arrive before it succeeds, so poll.
    vi.setSystemTime(Date.now() + 31_000);
    await vi.waitFor(async () => {
      const healed = await driveExpress(middleware);
      expect(healed.status).toBe(402);
    });
  });

  it("floors background retries to one attempt per interval during an outage", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    stubFacilitator(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const middleware = weftPaymentMiddleware(routes, baseConfig);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recorded).toHaveLength(1); // the boot attempt

    // A refused connection settles in ~1ms, so without the floor each of
    // these would launch a fresh /supported call.
    await driveExpress(middleware);
    await driveExpress(middleware);
    await new Promise((resolve) => setImmediate(resolve));
    expect(recorded).toHaveLength(1);

    vi.setSystemTime(Date.now() + 31_000);
    await driveExpress(middleware);
    await new Promise((resolve) => setImmediate(resolve));
    await driveExpress(middleware); // inside the re-armed interval
    await new Promise((resolve) => setImmediate(resolve));
    expect(recorded).toHaveLength(2);
  });

  it("constructs immediately while the facilitator hangs, and unprotected traffic flows", async () => {
    stubFacilitator(() => new Promise<Response>(() => undefined));

    const middleware = weftPaymentMiddleware(routes, baseConfig);

    const { next } = await driveExpress(middleware, "/healthz");
    expect(next).toHaveBeenCalledWith();
  });

  it("constructs the Hono middleware while the facilitator is down", async () => {
    stubFacilitator(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const middleware = weftPaymentMiddlewareHono(routes, baseConfig);
    await new Promise((resolve) => setImmediate(resolve));

    const c = {
      req: {
        method: "GET",
        path: "/healthz",
        url: "https://api.acme.test/healthz",
        header: () => undefined,
        query: (() => ({})) as never,
        json: async () => undefined,
      },
      res: undefined as Response | undefined,
      header: () => undefined,
      html: (body: string) => new Response(body),
      json: (body: unknown) => new Response(JSON.stringify(body)),
    };
    const next = vi.fn(async () => undefined);
    await middleware(c, next);
    expect(next).toHaveBeenCalled();
  });

  it("never calls the facilitator at all when syncFacilitatorOnStart is false", async () => {
    stubHealthyFacilitator();

    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      apiKey: "wk_live_abc123",
      name: "Acme Pricing API",
      syncFacilitatorOnStart: false,
    });
    await new Promise((resolve) => setImmediate(resolve));
    await driveExpress(middleware);

    expect(recorded).toHaveLength(0);
  });
});

describe("exported handshake constants", () => {
  it("names the declared-identity header", () => {
    expect(WEFT_DECLARED_HEADER).toBe("X-Weft-Declared");
  });

  it("names the facilitator API-key header", () => {
    expect(WEFT_API_KEY_HEADER).toBe("X-API-Key");
  });
});

/**
 * The money-path guarantee: `apiKey` alone must authenticate settlement and
 * attribute verification.
 *
 * The Weft facilitator's `/settle` handler validates `X-API-Key` and 401s
 * without it, so a seller who sets `apiKey` and hand-writes no facilitator
 * auth used to get a working handshake and a working verify, then a 401 on
 * every settle — the step that credits their wallet. `apiKey` exists to make
 * that impossible. The facilitator also reads `X-API-Key` on `/verify` — not
 * to gate the call, but to stamp the verification event with the key's digest
 * — so `apiKey` must ride `/verify` too, or the seller's funnel counts
 * settlements against zero verification attempts.
 */
describe("apiKey authenticates settlement and attributes verification", () => {
  /**
   * The kind advertised by `/supported`, used to build a payable challenge.
   */
  const supportedBody = JSON.stringify({
    kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
    extensions: [],
    signers: {},
  });

  /**
   * Stub a facilitator that answers /supported, /verify and /settle, and
   * records the headers each request carried.
   */
  function stubPayableFacilitator(): void {
    recorded = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(init?.headers ?? {})) {
          headers[name.toLowerCase()] = String(value);
        }
        const target = String(url);
        recorded.push({ url: target, headers });

        if (target.endsWith("/supported")) {
          return new Response(supportedBody, { status: 200 });
        }
        if (target.endsWith("/verify")) {
          return new Response(JSON.stringify({ isValid: true }), {
            status: 200,
          });
        }
        if (target.endsWith("/settle")) {
          return new Response(
            JSON.stringify({
              success: true,
              transaction: "0xabc",
              network: NETWORK,
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${target}`);
      }),
    );
  }

  /**
   * Build the real `@x402/core` buyer client with a stub signing scheme.
   *
   * @returns A client that turns a challenge into a payment payload
   */
  function buyerClient(): x402Client {
    const fakeClientScheme: SchemeNetworkClient = {
      scheme: "exact",
      async createPaymentPayload() {
        return {
          x402Version: 2,
          payload: { signature: "0xsig", authorization: {} },
        };
      },
    };
    return x402Client
      .fromConfig({ schemes: [], spendControls: false })
      .register(NETWORK, fakeClientScheme);
  }

  /**
   * Drive one full unpaid-then-paid exchange through the Express middleware.
   *
   * @param config - Middleware configuration under test
   * @returns The headers the `/settle` request carried
   */
  async function settleHeadersFor(
    config: WeftExpressMiddlewareConfig,
  ): Promise<Record<string, string>> {
    const middleware = weftPaymentMiddleware(routes, config);

    // First request: unpaid. Decode the challenge it emits.
    const headers: Record<string, string> = { host: "api.acme.test" };
    const captured = { status: 0, headers: {} as Record<string, string> };
    const unpaidReq = {
      method: "GET",
      path: "/v1/search",
      protocol: "https",
      headers,
      query: {},
      header: (name: string) => headers[name.toLowerCase()],
    };
    const res = {
      statusCode: 0,
      status(code: number) {
        captured.status = code;
        res.statusCode = code;
        return res;
      },
      setHeader(name: string, value: string) {
        captured.headers[name] = value;
        return res;
      },
      send: () => res,
      json: () => res,
      writeHead: (() => res) as (...args: unknown[]) => typeof res,
      write: (() => true) as (...args: unknown[]) => boolean,
      end: (() => res) as (...args: unknown[]) => typeof res,
      getHeaders: () => captured.headers,
      removeHeader(name: string) {
        delete captured.headers[name];
      },
      flushHeaders: () => undefined,
    };
    await middleware(unpaidReq, res, vi.fn());

    const challengeHeader = captured.headers["PAYMENT-REQUIRED"];
    const { decodePaymentRequiredHeader } = await import("@x402/core/http");
    const challenge = decodePaymentRequiredHeader(challengeHeader);
    const payload = await buyerClient().createPaymentPayload(challenge);

    // Second request: paid. This is the one that reaches /settle.
    const paidHeaders: Record<string, string> = {
      host: "api.acme.test",
      "payment-signature": encodePaymentSignatureHeader(payload),
    };
    const paidReq = {
      method: "GET",
      path: "/v1/search",
      protocol: "https",
      headers: paidHeaders,
      query: {},
      header: (name: string) => paidHeaders[name.toLowerCase()],
    };
    const paidRes = {
      ...res,
      statusCode: 0,
      status(code: number) {
        paidRes.statusCode = code;
        return paidRes;
      },
    };
    await middleware(paidReq, paidRes, () => {
      paidRes.statusCode = 200;
      paidRes.end();
    });

    const settle = recorded.find((request) => request.url.endsWith("/settle"));
    expect(settle).toBeDefined();
    return (settle as RecordedFetch).headers;
  }

  /**
   * Drive the same unpaid-then-paid exchange and return the headers the
   * `/verify` request carried. `/verify` runs before `/settle` in one paid
   * call, so the drive that records the settle headers records these too.
   *
   * @param config - Middleware configuration under test
   * @returns The headers the `/verify` request carried
   */
  async function verifyHeadersFor(
    config: WeftExpressMiddlewareConfig,
  ): Promise<Record<string, string>> {
    await settleHeadersFor(config);
    const verify = recorded.find((request) => request.url.endsWith("/verify"));
    expect(verify).toBeDefined();
    return (verify as RecordedFetch).headers;
  }

  beforeEach(() => {
    stubPayableFacilitator();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("sends the configured apiKey as X-API-Key on /settle with no hand-written auth", async () => {
    const settleHeaders = await settleHeadersFor({
      ...baseConfig,
      apiKey: "wk_live_settle_me",
    });

    expect(settleHeaders["x-api-key"]).toBe("wk_live_settle_me");
  });

  it("lets a seller's own settle auth win over the apiKey default", async () => {
    const settleHeaders = await settleHeadersFor({
      ...baseConfig,
      apiKey: "wk_live_config_key",
      facilitator: {
        url: FACILITATOR_URL,
        createAuthHeaders: async () => ({
          settle: { "X-API-Key": "wk_live_seller_key" },
        }),
      },
    });

    expect(settleHeaders["x-api-key"]).toBe("wk_live_seller_key");
  });

  it("sends no X-API-Key on /settle when no apiKey is configured", async () => {
    const settleHeaders = await settleHeadersFor(baseConfig);

    expect(settleHeaders["x-api-key"]).toBeUndefined();
  });

  it("derives an X-API-Key settle header directly from a configured key", async () => {
    const client = createFacilitatorClient(
      { url: FACILITATOR_URL },
      buildFacilitatorAuthHeaders("express", "wk_live_direct", {}),
    );

    expect((await client.createAuthHeaders("settle")).headers).toEqual({
      "X-API-Key": "wk_live_direct",
    });
  });

  it("derives no settle auth at all without an apiKey", async () => {
    const client = createFacilitatorClient(
      { url: FACILITATOR_URL },
      buildFacilitatorAuthHeaders("express", undefined, {}),
    );

    expect((await client.createAuthHeaders("settle")).headers).toEqual({});
  });

  it("sends the configured apiKey as X-API-Key on /verify with no hand-written auth", async () => {
    const verifyHeaders = await verifyHeadersFor({
      ...baseConfig,
      apiKey: "wk_live_verify_me",
    });

    expect(verifyHeaders["x-api-key"]).toBe("wk_live_verify_me");
  });

  it("lets a seller's own verify auth win over the apiKey default", async () => {
    const verifyHeaders = await verifyHeadersFor({
      ...baseConfig,
      apiKey: "wk_live_config_key",
      facilitator: {
        url: FACILITATOR_URL,
        createAuthHeaders: async () => ({
          verify: { "X-API-Key": "wk_live_seller_key" },
        }),
      },
    });

    expect(verifyHeaders["x-api-key"]).toBe("wk_live_seller_key");
  });

  it("sends no X-API-Key on /verify when no apiKey is configured", async () => {
    const verifyHeaders = await verifyHeadersFor(baseConfig);

    expect(verifyHeaders["x-api-key"]).toBeUndefined();
  });

  it("derives an X-API-Key verify header directly from a configured key", async () => {
    const client = createFacilitatorClient(
      { url: FACILITATOR_URL },
      buildFacilitatorAuthHeaders("express", "wk_live_direct", {}),
    );

    expect((await client.createAuthHeaders("verify")).headers).toEqual({
      "X-API-Key": "wk_live_direct",
    });
  });

  it("derives no verify auth at all without an apiKey", async () => {
    const client = createFacilitatorClient(
      { url: FACILITATOR_URL },
      buildFacilitatorAuthHeaders("express", undefined, {}),
    );

    expect((await client.createAuthHeaders("verify")).headers).toEqual({});
  });
});

/**
 * Declared dimensions: the seller's statement about which fields in
 * `weft.request` revenue may be summed by.
 *
 * They travel on this handshake and nowhere else. The payment blob is
 * buyer-echoed, so an aggregate over an undeclared key would be summing
 * buyer-controlled input; a name here is one the seller vouched for under
 * their own API key. Same boot-path posture as everything else in this file:
 * clamp, drop, warn once, never throw.
 */
describe("declared dimensions ride the handshake", () => {
  /**
   * Decode the `X-Weft-Declared` payload the SDK would send.
   *
   * @param dimensions - The declared `dimensions` value, however malformed
   * @returns The decoded payload, or undefined when no header would be sent
   */
  function declaredPayload(dimensions: unknown): Record<string, unknown> | undefined {
    const headers = buildFacilitatorAuthHeaders("express", "wk_live_abc", {
      name: "Acme Image API",
      dimensions,
    } as never);
    const encoded = headers.supported[WEFT_DECLARED_HEADER];
    if (encoded === undefined) {
      return undefined;
    }
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)));
  }

  it("carries the declared names", () => {
    expect(declaredPayload(["model", "tier"])?.dimensions).toEqual([
      "model",
      "tier",
    ]);
  });

  it("never puts them on the 402 challenge", () => {
    const routes = applyProductIdentity(
      {
        "POST /v1/generate": {
          accepts: {
            scheme: "exact",
            network: "eip155:84532",
            payTo: "0x0000000000000000000000000000000000000001",
            price: "$0.01",
          },
        },
      } as never,
      { productId: "prod_9f2c", dimensions: ["model"] } as never,
    ) as Record<string, { extensions?: Record<string, unknown> }>;

    // The challenge is buyer-visible and buyer-echoable; a dimension list
    // there would be exactly the unauthenticated statement this field exists
    // to avoid being.
    expect(
      JSON.stringify(routes["POST /v1/generate"].extensions),
    ).not.toContain("model");
  });

  it("drops names that could not be a field, keeping the rest", () => {
    expect(declaredPayload(["model", "a b", "1st", ""])?.dimensions).toEqual([
      "model",
    ]);
  });

  it("dedupes and caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) => `d${i}`);
    const payload = declaredPayload([...many, "d0"]);

    expect(payload?.dimensions).toHaveLength(8);
    expect(payload?.dimensions).toEqual(many.slice(0, 8));
  });

  it("costs the field and never the handshake when it is junk", () => {
    const payload = declaredPayload("model");

    expect(payload?.dimensions).toBeUndefined();
    expect(payload?.name).toBe("Acme Image API");
  });

  it("sends no header at all when nothing was declared", () => {
    const headers = buildFacilitatorAuthHeaders("express", "wk_live_abc", {});
    expect(headers.supported[WEFT_DECLARED_HEADER]).toBeUndefined();
  });
});
