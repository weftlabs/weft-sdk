import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { parsePaymentRequired } from "@x402/core/schemas";
import type {
  Network,
  PaymentRequirements,
  SchemeNetworkServer,
} from "@x402/core/types";
import {
  weftPaymentMiddleware,
  type WeftExpressMiddlewareConfig,
} from "../src/facilitator/middleware/express";
import {
  weftPaymentMiddlewareHono,
  type WeftHonoMiddlewareConfig,
} from "../src/facilitator/middleware/hono";
import type {
  WeftRouteConfig,
  WeftRoutesConfig,
} from "../src/facilitator/middleware/product";

/**
 * End-to-end coverage for the 402 challenge our middleware actually emits.
 *
 * These tests drive the real `@x402/core` resource server, then decode the
 * `PAYMENT-REQUIRED` response header with the same function a buyer's client
 * uses. Nothing about the resource payload is faked: only the facilitator's
 * `/supported` HTTP call and the scheme's price maths are stubbed, because
 * neither touches `ResourceInfo`.
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

/**
 * Build routes with extra fields on the single protected route.
 *
 * @param overrides - Fields to merge into the route config
 * @returns A routes config with the overrides applied
 */
function routesWith(overrides: Partial<WeftRouteConfig>): WeftRoutesConfig {
  return {
    "GET /v1/search": {
      ...(routes as Record<string, WeftRouteConfig>)["GET /v1/search"],
      ...overrides,
    },
  };
}

const baseConfig = {
  facilitator: { url: FACILITATOR_URL },
  schemes: [{ network: NETWORK, server: fakeScheme }],
} satisfies WeftExpressMiddlewareConfig & WeftHonoMiddlewareConfig;

/** Records everything a framework handed back to the caller. */
interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Drive the Express middleware for an unpaid GET and capture the response.
 *
 * @param routesConfig - Routes to protect
 * @param config - Middleware configuration, including product identity
 * @returns The captured HTTP response
 */
async function callExpress(
  routesConfig: WeftRoutesConfig,
  config: WeftExpressMiddlewareConfig,
): Promise<CapturedResponse> {
  const middleware = weftPaymentMiddleware(routesConfig, config);

  const headers: Record<string, string> = { host: "api.acme.test" };
  const req = {
    method: "GET",
    path: "/v1/search",
    protocol: "https",
    headers,
    query: {},
    header: (name: string) => headers[name.toLowerCase()],
  };

  const captured: CapturedResponse = {
    status: 0,
    headers: {},
    body: undefined,
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
    getHeaders() {
      return captured.headers;
    },
    send(body: unknown) {
      captured.body = body;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
    writeHead: () => res,
    write: () => true,
    end: () => res,
    flushHeaders: () => undefined,
  };

  const next = vi.fn();
  await middleware(req, res, next);

  expect(next).not.toHaveBeenCalled();
  return captured;
}

/**
 * Drive the Hono middleware for an unpaid GET and capture the response.
 *
 * @param routesConfig - Routes to protect
 * @param config - Middleware configuration, including product identity
 * @returns The captured HTTP response
 */
async function callHono(
  routesConfig: WeftRoutesConfig,
  config: WeftHonoMiddlewareConfig,
): Promise<CapturedResponse> {
  const middleware = weftPaymentMiddlewareHono(routesConfig, config);

  const captured: CapturedResponse = {
    status: 0,
    headers: {},
    body: undefined,
  };
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
    header(name: string, value: string) {
      captured.headers[name] = value;
    },
    html(body: string, status?: number) {
      captured.body = body;
      captured.status = status ?? 200;
      return new Response(body, { status });
    },
    json(body: unknown, status?: number) {
      captured.body = body;
      captured.status = status ?? 200;
      return new Response(JSON.stringify(body), { status });
    },
  };

  const next = vi.fn(async () => undefined);
  await middleware(c, next);

  expect(next).not.toHaveBeenCalled();
  return captured;
}

/**
 * Decode the 402 challenge exactly as a buyer's x402 client would, and hold it
 * to the x402 protocol's own validator on the way past.
 *
 * `parsePaymentRequired` is written upstream and applied by no code path our
 * middleware runs, so it is a ground truth we did not generate. Running it here
 * rather than in one opt-in test means no case in this file — present or future
 * — can assert on a challenge without first proving the challenge is legal.
 * That matters because the schema rejects the *whole* `PaymentRequired` when a
 * single cosmetic field is out of bounds: a seller does not lose their product
 * name, they lose the challenge.
 *
 * @param response - The captured HTTP response
 * @returns The decoded `PaymentRequired`
 */
function decodeChallenge(response: CapturedResponse) {
  expect(response.status).toBe(402);

  const header = response.headers["PAYMENT-REQUIRED"];
  expect(header).toBeDefined();

  const challenge = decodePaymentRequiredHeader(header);
  const parsed = parsePaymentRequired(challenge);

  expect(parsed.error).toBeUndefined();
  expect(parsed.success).toBe(true);

  return challenge;
}

/**
 * Decode the 402 challenge and return the block a buyer copies onto its payment.
 *
 * @param response - The captured HTTP response
 * @returns The `resource` block the buyer will copy onto its payment payload
 */
function resourceFromChallenge(response: CapturedResponse) {
  return decodeChallenge(response).resource;
}

describe("402 challenge carries declared product identity", () => {
  beforeEach(() => {
    const supported = JSON.stringify({
      kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
      extensions: [],
      signers: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (!String(url).endsWith("/supported")) {
          throw new Error(`unexpected fetch: ${String(url)}`);
        }
        return new Response(supported, { status: 200 });
      }),
    );

    // Identity the protocol cannot carry is reported at construction; the
    // point of these tests is what reaches the wire, not the boot log.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("puts serviceName, tags and iconUrl on the Express challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        name: "Acme Pricing API",
        type: "api",
        tags: ["finance", "pricing"],
        iconUrl: "https://acme.test/icon.png",
      }),
    );

    expect(resource).toMatchObject({
      url: "https://api.acme.test/v1/search",
      serviceName: "Acme Pricing API",
      tags: ["weft:type:api", "finance", "pricing"],
      iconUrl: "https://acme.test/icon.png",
    });
  });

  it("puts serviceName, tags and iconUrl on the Hono challenge", async () => {
    const resource = resourceFromChallenge(
      await callHono(routes, {
        ...baseConfig,
        name: "Acme Pricing API",
        type: "mcp",
        tags: ["finance"],
        iconUrl: "https://acme.test/icon.png",
      }),
    );

    expect(resource).toMatchObject({
      url: "https://api.acme.test/v1/search",
      serviceName: "Acme Pricing API",
      tags: ["weft:type:mcp", "finance"],
      iconUrl: "https://acme.test/icon.png",
    });
  });

  it("carries the product type when nothing else is declared", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, { ...baseConfig, type: "agent" }),
    );

    expect(resource.tags).toEqual(["weft:type:agent"]);
    expect(resource).not.toHaveProperty("serviceName");
    expect(resource).not.toHaveProperty("iconUrl");
  });

  it("lets a per-route serviceName win on the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routesWith({ serviceName: "Acme Search" }), {
        ...baseConfig,
        name: "Acme Pricing API",
        type: "api",
      }),
    );

    expect(resource.serviceName).toBe("Acme Search");
    expect(resource.tags).toEqual(["weft:type:api"]);
  });

  it("omits identity fields entirely when the seller declares none", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, baseConfig),
    );

    expect(resource.url).toBe("https://api.acme.test/v1/search");
    expect(resource).not.toHaveProperty("serviceName");
    expect(resource).not.toHaveProperty("tags");
    expect(resource).not.toHaveProperty("iconUrl");
  });

  it("carries a per-route type on the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routesWith({ type: "mcp" }), {
        ...baseConfig,
        type: "api",
      }),
    );

    expect(resource.tags).toEqual(["weft:type:mcp"]);
    expect(resource).not.toHaveProperty("type");
  });

  it("still emits a payable challenge alongside the identity", async () => {
    const challenge = decodeChallenge(
      await callExpress(routes, {
        ...baseConfig,
        name: "Acme Pricing API",
        type: "api",
      }),
    );

    expect(challenge.accepts).toHaveLength(1);
    expect(challenge.accepts[0]).toMatchObject({
      scheme: "exact",
      network: NETWORK,
      payTo: PAY_TO,
      amount: "10000",
      asset: ASSET,
    });
  });
});

/**
 * Identity a seller can plausibly write that the x402 schema will not carry.
 *
 * Each case here is one the middleware used to put on the wire verbatim, and
 * `parsePaymentRequired` rejects the *entire* `PaymentRequired` on any one of
 * them — `too_big`, `invalid_string`, `invalid_type` — not just the offending
 * field. These are therefore the cases the oracle most needs to see, so they
 * are named individually rather than left to the happy path.
 */
describe("402 challenge stays legal for identity the protocol cannot carry", () => {
  beforeEach(() => {
    const supported = JSON.stringify({
      kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
      extensions: [],
      signers: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (!String(url).endsWith("/supported")) {
          throw new Error(`unexpected fetch: ${String(url)}`);
        }
        return new Response(supported, { status: 200 });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("truncates an ordinary product name that exceeds the 32-char cap", async () => {
    const name = "Acme Real Estate Property Records API";
    expect(name.length).toBeGreaterThan(32);

    const resource = resourceFromChallenge(
      await callExpress(routes, { ...baseConfig, name, type: "api" }),
    );

    expect(resource.serviceName).toBe("Acme Real Estate Property Record");
  });

  it("keeps a non-ASCII product name off the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, { ...baseConfig, name: "Acme Café" }),
    );

    expect(resource).not.toHaveProperty("serviceName");
  });

  it("keeps an illegal product type out of the tags", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        type: "Real Time Financial Market Data Feed" as never,
        tags: ["finance"],
      }),
    );

    expect(resource.tags).toEqual(["finance"]);
  });

  it("survives null identity fields", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        name: null,
        type: null,
        tags: null,
        iconUrl: null,
      } as never),
    );

    expect(resource).not.toHaveProperty("serviceName");
    expect(resource).not.toHaveProperty("tags");
    expect(resource).not.toHaveProperty("iconUrl");
  });

  it("survives tags that are not an array of strings", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        tags: "finance,pricing",
      } as never),
    );

    expect(resource).not.toHaveProperty("tags");
  });

  it("keeps a javascript: iconUrl off the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        iconUrl: "javascript:alert(1)",
      }),
    );

    expect(resource).not.toHaveProperty("iconUrl");
  });

  it("keeps an over-long iconUrl off the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        iconUrl: `https://acme.test/${"x".repeat(2048)}.png`,
      }),
    );

    expect(resource).not.toHaveProperty("iconUrl");
  });

  it("clamps overflowing tags rather than emitting six", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routes, {
        ...baseConfig,
        name: "Acme Pricing API",
        type: "api",
        tags: ["one", "two", "three", "four", "five", "six"],
      }),
    );

    expect(resource.tags).toEqual([
      "weft:type:api",
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  it("keeps a malformed route-level tag off the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routesWith({ tags: ["search", "x".repeat(99)] }), {
        ...baseConfig,
        name: "Acme Pricing API",
      }),
    );

    expect(resource.tags).toEqual(["search"]);
  });

  /**
   * The route's own tags are already on the object being merged, so when the
   * SDK drops *all* of them there is nothing left to overwrite them with. This
   * is the case where a drop can look like it worked and quietly have not.
   */
  it("keeps a route-level tag off the challenge when it is the only one", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routesWith({ tags: ["x".repeat(99)] }), {
        ...baseConfig,
        name: "Acme Pricing API",
      }),
    );

    expect(resource).not.toHaveProperty("tags");
  });

  it("keeps a malformed route-level iconUrl off the challenge", async () => {
    const resource = resourceFromChallenge(
      await callExpress(routesWith({ iconUrl: "javascript:alert(1)" }), {
        ...baseConfig,
        name: "Acme Pricing API",
      }),
    );

    expect(resource).not.toHaveProperty("iconUrl");
  });

  it("holds the Hono challenge to the same schema", async () => {
    const resource = resourceFromChallenge(
      await callHono(routes, {
        ...baseConfig,
        name: "Acme Real Estate Property Records API",
        type: "mcp",
        tags: ["finance", "x".repeat(33)],
        iconUrl: "javascript:alert(1)",
      }),
    );

    expect(resource.serviceName).toBe("Acme Real Estate Property Record");
    expect(resource.tags).toEqual(["weft:type:mcp", "finance"]);
    expect(resource).not.toHaveProperty("iconUrl");
  });
});
