import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { x402Client } from "@x402/core/client";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { parsePaymentRequired } from "@x402/core/schemas";
import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SchemeNetworkClient,
  SchemeNetworkServer,
} from "@x402/core/types";
import {
  weftPaymentMiddleware,
  type WeftExpressMiddlewareConfig,
} from "../src/facilitator/middleware/express";
import { weftPaymentMiddlewareHono } from "../src/facilitator/middleware/hono";
import {
  applyProductIdentity,
  WEFT_PRODUCT_EXTENSION_KEY,
  WEFT_PRODUCT_INFO_SCHEMA,
  type WeftRoutesConfig,
} from "../src/facilitator/middleware/product";

/**
 * End-to-end coverage for the `weft.product` extension on the 402 challenge.
 *
 * The near half drives the real `@x402/core` resource server and decodes the
 * challenge the way a buyer would. The far half goes further than any other
 * suite in this repo: it hands the challenge to the real `@x402/core` buyer
 * client, lets it build the payment payload, and asserts the extension is
 * echoed onto that payload and onto the facilitator wire — the echo rule the
 * facilitator's `extensions` relay depends on.
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
} satisfies WeftExpressMiddlewareConfig;

/** One request the stubbed facilitator received. */
interface RecordedFetch {
  url: string;
  body: unknown;
}

let recorded: RecordedFetch[];

/** Stub a facilitator that answers /supported, /verify and /settle. */
function stubFacilitator(): void {
  recorded = [];

  const supported = JSON.stringify({
    kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
    extensions: [],
    signers: {},
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      recorded.push({
        url: target,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      if (target.endsWith("/supported")) {
        return new Response(supported, { status: 200 });
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

/** Captured response from one middleware drive. */
interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Drive the Express middleware once.
 *
 * @param middleware - The middleware under test
 * @param options - Request headers and whether next() simulates a handler
 * @returns The captured response
 */
async function driveExpress(
  middleware: ReturnType<typeof weftPaymentMiddleware>,
  options: { headers?: Record<string, string>; handler?: boolean } = {},
): Promise<CapturedResponse> {
  const headers: Record<string, string> = {
    host: "api.acme.test",
    ...Object.fromEntries(
      Object.entries(options.headers ?? {}).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    ),
  };
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
    send(body: unknown) {
      captured.body = body;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
    writeHead: (() => res) as (...args: unknown[]) => typeof res,
    write: (() => true) as (...args: unknown[]) => boolean,
    end: (() => res) as (...args: unknown[]) => typeof res,
    getHeaders: () => captured.headers,
    removeHeader(name: string) {
      delete captured.headers[name];
    },
    flushHeaders: () => undefined,
  };

  const next = options.handler
    ? vi.fn(() => {
        res.statusCode = 200;
        res.end();
      })
    : vi.fn();
  await middleware(req, res, next);
  // A settled request never goes through res.status(): the handler wrote
  // statusCode directly and the middleware only appended headers.
  captured.status = captured.status || res.statusCode;
  return captured;
}

/**
 * Decode and schema-validate the 402 challenge like a buyer's client.
 *
 * @param response - The captured HTTP response
 * @returns The decoded `PaymentRequired`
 */
function decodeChallenge(response: CapturedResponse): PaymentRequired {
  expect(response.status).toBe(402);
  const header = response.headers["PAYMENT-REQUIRED"];
  expect(header).toBeDefined();

  const challenge = decodePaymentRequiredHeader(header);
  const parsed = parsePaymentRequired(challenge);
  expect(parsed.error).toBeUndefined();
  expect(parsed.success).toBe(true);

  return challenge as PaymentRequired;
}

/**
 * Build the real `@x402/core` buyer client with a stub signing scheme.
 *
 * @returns A client that can turn a challenge into a payment payload
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

const DECLARED = {
  ...baseConfig,
  name: "Acme Pricing API",
  type: "api",
  tags: ["finance"],
  productId: "prod_9f2c",
  manifestHash: "sha256:6ad9",
} satisfies WeftExpressMiddlewareConfig;

const EXPECTED_EXTENSION = {
  info: {
    kind: "api",
    product_id: "prod_9f2c",
    manifest_hash: "sha256:6ad9",
  },
  schema: WEFT_PRODUCT_INFO_SCHEMA,
};

beforeEach(() => {
  stubFacilitator();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the 402 challenge declares weft.product", () => {
  it("carries info and its Draft 2020-12 schema on the Express challenge", async () => {
    const middleware = weftPaymentMiddleware(routes, DECLARED);
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual(
      EXPECTED_EXTENSION,
    );
    expect(WEFT_PRODUCT_INFO_SCHEMA.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });

  it("carries the same declaration on the Hono challenge", async () => {
    const middleware = weftPaymentMiddlewareHono(routes, DECLARED);

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
        captured.status = status ?? 200;
        return new Response(body, { status });
      },
      json(body: unknown, status?: number) {
        captured.status = status ?? 200;
        return new Response(JSON.stringify(body), { status });
      },
    };
    await middleware(c, async () => undefined);

    const challenge = decodeChallenge(captured);
    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual(
      EXPECTED_EXTENSION,
    );
  });

  it("keeps the weft:type tag shim alongside the extension", async () => {
    const middleware = weftPaymentMiddleware(routes, DECLARED);
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.resource?.tags).toEqual(["weft:type:api", "finance"]);
  });

  it("omits absent fields from info instead of sending them empty", async () => {
    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      type: "mcp",
      productId: "prod_9f2c",
    });
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual({
      info: { kind: "mcp", product_id: "prod_9f2c" },
      schema: WEFT_PRODUCT_INFO_SCHEMA,
    });
  });

  it("declares the extension for a productId alone", async () => {
    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      productId: "prod_9f2c",
    });
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual({
      info: { product_id: "prod_9f2c" },
      schema: WEFT_PRODUCT_INFO_SCHEMA,
    });
  });

  it("uses the per-route type for the route's own kind", async () => {
    const middleware = weftPaymentMiddleware(
      {
        "GET /v1/search": {
          ...(routes as Record<string, never>)["GET /v1/search"],
          type: "mcp",
        },
      } as WeftRoutesConfig,
      { ...baseConfig, type: "api", productId: "prod_9f2c" },
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    const extension = challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY] as {
      info: Record<string, unknown>;
    };
    expect(extension.info.kind).toBe("mcp");
  });

  it("emits no extension when no kind, productId or manifestHash exists", async () => {
    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      name: "Acme Pricing API",
      tags: ["finance"],
    });
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions).toBeUndefined();
  });

  it("drops empty and non-string product fields instead of shipping them", async () => {
    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      type: "api",
      productId: "   ",
      manifestHash: 42 as never,
    });
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual({
      info: { kind: "api" },
      schema: WEFT_PRODUCT_INFO_SCHEMA,
    });
  });

  it("ships product ids trimmed, so exact-string joins hold", async () => {
    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      productId: " prod_9f2c ",
      manifestHash: " sha256:6ad9 ",
    });
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual({
      info: { product_id: "prod_9f2c", manifest_hash: "sha256:6ad9" },
      schema: WEFT_PRODUCT_INFO_SCHEMA,
    });
  });

  it("publishes additionalProperties: false as the info contract", async () => {
    const middleware = weftPaymentMiddleware(routes, DECLARED);
    const challenge = decodeChallenge(await driveExpress(middleware));

    const extension = challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY] as {
      schema: Record<string, unknown>;
    };
    // A contract statement for consumers, not an enforcement: it is the
    // declared basis for stripping buyer-added fields downstream.
    expect(extension.schema.additionalProperties).toBe(false);
  });

  it("lets a route-level weft.product declaration win over the config", async () => {
    const routeDeclared = {
      info: { kind: "agent", product_id: "prod_route" },
      schema: WEFT_PRODUCT_INFO_SCHEMA,
    };
    const middleware = weftPaymentMiddleware(
      {
        "GET /v1/search": {
          ...(routes as Record<string, never>)["GET /v1/search"],
          extensions: { [WEFT_PRODUCT_EXTENSION_KEY]: routeDeclared },
        },
      } as WeftRoutesConfig,
      DECLARED,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual(
      routeDeclared,
    );
  });

  it("preserves a route's other extensions next to weft.product", async () => {
    const middleware = weftPaymentMiddleware(
      {
        "GET /v1/search": {
          ...(routes as Record<string, never>)["GET /v1/search"],
          extensions: { "acme.custom": { info: { note: "kept" } } },
        },
      } as WeftRoutesConfig,
      DECLARED,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.["acme.custom"]).toEqual({
      info: { note: "kept" },
    });
    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual(
      EXPECTED_EXTENSION,
    );
  });
});

describe("junk route extensions follow the pass-through contract", () => {
  it("leaves the junk on the route, skips the declaration, and says exactly that", () => {
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });

    const junk = "not-an-object";
    const merged = applyProductIdentity(
      {
        "GET /v1/search": {
          ...(routes as Record<string, never>)["GET /v1/search"],
          extensions: junk as never,
        },
      } as WeftRoutesConfig,
      { productId: "prod_9f2c" },
    ) as Record<string, { extensions?: unknown }>;

    // The junk ships to @x402/core untouched — that is the pass-through
    // contract — and the warning must describe that, not claim it was
    // ignored.
    expect(merged["GET /v1/search"].extensions).toBe(junk);
    const warning = warnings.find((line) => line.includes("extensions"));
    expect(warning).toContain("leaving them untouched");
    expect(warning).toContain(`skipping the ${WEFT_PRODUCT_EXTENSION_KEY}`);
  });
});

describe("applyProductIdentity pass-through stays intact", () => {
  it("returns the routes untouched when nothing product-shaped is declared", () => {
    expect(applyProductIdentity(routes, {})).toBe(routes);
  });

  it("does process routes for a productId alone", () => {
    const merged = applyProductIdentity(routes, { productId: "prod_9f2c" });

    expect(merged).not.toBe(routes);
  });

  it("does process routes for a manifestHash alone", () => {
    const merged = applyProductIdentity(routes, {
      manifestHash: "sha256:6ad9",
    });

    expect(merged).not.toBe(routes);
  });
});

describe("a real @x402/core buyer echoes the extension", () => {
  it("copies weft.product onto the payment payload verbatim", async () => {
    const middleware = weftPaymentMiddleware(routes, DECLARED);
    const challenge = decodeChallenge(await driveExpress(middleware));

    const payload = await buyerClient().createPaymentPayload(challenge);

    expect(payload.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toEqual(
      EXPECTED_EXTENSION,
    );
  });

  it("delivers the echoed extension to the facilitator on verify and settle", async () => {
    const middleware = weftPaymentMiddleware(routes, DECLARED);
    const challenge = decodeChallenge(await driveExpress(middleware));
    const payload = await buyerClient().createPaymentPayload(challenge);

    const paid = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(paid.status).toBe(200);
    const verify = recorded.find((request) => request.url.endsWith("/verify"));
    const settle = recorded.find((request) => request.url.endsWith("/settle"));
    for (const wire of [verify, settle]) {
      expect(wire).toBeDefined();
      const body = wire?.body as {
        paymentPayload: { extensions: Record<string, unknown> };
      };
      expect(
        body.paymentPayload.extensions[WEFT_PRODUCT_EXTENSION_KEY],
      ).toEqual(EXPECTED_EXTENSION);
    }
  });

  /**
   * The trust boundary, pinned as behaviour: upstream's echo check is a
   * subset match, so a buyer may ADD unadvertised fields to the echoed
   * `info` and still settle. This is exactly why consumers must treat
   * echoed extension contents as unauthenticated buyer input and key
   * attribution on the seller-authenticated join instead (weft-app #635
   * freezes payments.product_id from the settling API key, never from
   * this payload). If an @x402/core bump ever tightens this, the test
   * fails loudly and the contract note should be revisited.
   */
  it("documents that buyer-added info fields pass the echo check and reach the wire", async () => {
    const middleware = weftPaymentMiddleware(routes, {
      ...baseConfig,
      type: "api",
    });
    const challenge = decodeChallenge(await driveExpress(middleware));
    const payload = (await buyerClient().createPaymentPayload(
      challenge,
    )) as PaymentPayload & {
      extensions: Record<string, { info: Record<string, unknown> }>;
    };
    payload.extensions[WEFT_PRODUCT_EXTENSION_KEY].info.product_id =
      "prod_forged_by_buyer";

    const paid = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(paid.status).toBe(200);
    const verify = recorded.find((request) => request.url.endsWith("/verify"));
    const body = verify?.body as {
      paymentPayload: {
        extensions: Record<string, { info: Record<string, unknown> }>;
      };
    };
    expect(
      body.paymentPayload.extensions[WEFT_PRODUCT_EXTENSION_KEY].info
        .product_id,
    ).toBe("prod_forged_by_buyer");
  });

  it("rejects a tampered echo before the facilitator is ever asked", async () => {
    const middleware = weftPaymentMiddleware(routes, DECLARED);
    const challenge = decodeChallenge(await driveExpress(middleware));
    const payload = (await buyerClient().createPaymentPayload(
      challenge,
    )) as PaymentPayload & {
      extensions: Record<string, { info: Record<string, unknown> }>;
    };
    payload.extensions[WEFT_PRODUCT_EXTENSION_KEY].info.kind = "agent";

    const tampered = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(tampered.status).toBe(402);
    const rechallenge = decodePaymentRequiredHeader(
      tampered.headers["PAYMENT-REQUIRED"],
    );
    expect(rechallenge.error).toBe("extension_echo_mismatch");
    expect(recorded.some((request) => request.url.endsWith("/verify"))).toBe(
      false,
    );
  });
});
