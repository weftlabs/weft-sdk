import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { x402Client } from "@x402/core/client";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { parsePaymentRequired } from "@x402/core/schemas";
import type {
  HTTPRequestContext,
  Network,
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
  MAX_EXTENSION_BYTES,
  WEFT_REQUEST_EXTENSION_KEY,
  WEFT_REQUEST_INFO_SCHEMA,
  type WeftDynamicExtension,
} from "../src/facilitator/middleware/extensions";
import {
  WEFT_PRODUCT_EXTENSION_KEY,
  type WeftRoutesConfig,
} from "../src/facilitator/middleware/product";

/**
 * Per-request route extensions: a callback under a route's `extensions` key,
 * evaluated where `price` is evaluated and shipped on the 402 challenge.
 *
 * The suite drives the real `@x402/core` resource server and the real buyer
 * client, so what it asserts is what a buyer would see and what the
 * facilitator would be handed — including the echo rule the relay depends on.
 */

const NETWORK: Network = "eip155:84532";
const FACILITATOR_URL = "https://facilitator.test";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const KEY = "acme.request";

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

const baseConfig = {
  facilitator: { url: FACILITATOR_URL },
  schemes: [{ network: NETWORK, server: fakeScheme }],
} satisfies WeftExpressMiddlewareConfig;

/**
 * Routes whose one extension key is resolved per request.
 *
 * @param extension - The callback (or static value) to declare
 * @returns A routes config for `POST /v1/generate`
 */
function routesWith(extension: unknown): WeftRoutesConfig {
  return {
    "POST /v1/generate": {
      accepts: {
        scheme: "exact",
        network: NETWORK,
        payTo: PAY_TO,
        price: "$0.01",
      },
      extensions: { [KEY]: extension },
    },
  } as WeftRoutesConfig;
}

/** One request the stubbed facilitator received. */
interface RecordedFetch {
  url: string;
  body: unknown;
}

let recorded: RecordedFetch[];
let warnings: string[];

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
        return new Response(JSON.stringify({ isValid: true }), { status: 200 });
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
 * Drive the Express middleware once against `POST /v1/generate`.
 *
 * @param middleware - The middleware under test
 * @param options - Request body, headers, and whether next() answers 200
 * @returns The captured response
 */
async function driveExpress(
  middleware: ReturnType<typeof weftPaymentMiddleware>,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    handler?: boolean;
  } = {},
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
    method: "POST",
    path: "/v1/generate",
    protocol: "https",
    headers,
    query: {},
    body: options.body ?? { model: "flux", max_tokens: 512 },
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

/**
 * The Pollinations-shaped callback: price context read off the body.
 *
 * `getBody()` is typed `unknown` and really is a promise on Hono and a plain
 * value on Express, so a portable callback always awaits it.
 */
const fromBody: WeftDynamicExtension = async (context: HTTPRequestContext) => {
  const body = (await context.adapter.getBody()) as {
    model: string;
    max_tokens: number;
  };
  return { info: { model: body.model, max_tokens: body.max_tokens } };
};

beforeEach(() => {
  stubFacilitator();
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a route extension callback lands on the 402 challenge", () => {
  it("stamps the request context the seller priced from", async () => {
    const middleware = weftPaymentMiddleware(routesWith(fromBody), baseConfig);
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({
      info: { model: "flux", max_tokens: 512 },
    });
  });

  it("resolves per request, not once at construction", async () => {
    const middleware = weftPaymentMiddleware(routesWith(fromBody), baseConfig);

    const first = decodeChallenge(await driveExpress(middleware));
    const second = decodeChallenge(
      await driveExpress(middleware, {
        body: { model: "turbo", max_tokens: 8 },
      }),
    );

    expect(first.extensions?.[KEY]).toEqual({
      info: { model: "flux", max_tokens: 512 },
    });
    expect(second.extensions?.[KEY]).toEqual({
      info: { model: "turbo", max_tokens: 8 },
    });
  });

  it("awaits an async callback", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith(async () => {
        await Promise.resolve();
        return { info: { model: "async" } };
      }),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({ info: { model: "async" } });
  });

  it("sits beside the static weft.product declaration", async () => {
    const middleware = weftPaymentMiddleware(routesWith(fromBody), {
      ...baseConfig,
      type: "api",
      productId: "prod_9f2c",
    });
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({
      info: { model: "flux", max_tokens: 512 },
    });
    expect(
      (challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY] as { info: unknown })
        .info,
    ).toEqual({ kind: "api", product_id: "prod_9f2c" });
  });

  it("leaves a statically declared key alone", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith({ info: { note: "static" } }),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({ info: { note: "static" } });
  });

  it("resolves the same key differently per route", async () => {
    const middleware = weftPaymentMiddleware(
      {
        "POST /v1/generate": {
          accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: "$0.01",
          },
          extensions: { [KEY]: () => ({ info: { route: "generate" } }) },
        },
        "POST /v1/embed": {
          accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: "$0.01",
          },
          extensions: { [KEY]: () => ({ info: { route: "embed" } }) },
        },
      } as WeftRoutesConfig,
      baseConfig,
    );

    const generate = decodeChallenge(await driveExpress(middleware));
    expect(generate.extensions?.[KEY]).toEqual({ info: { route: "generate" } });
  });

  it("ships the same way through the Hono middleware", async () => {
    const middleware = weftPaymentMiddlewareHono(
      routesWith(fromBody),
      baseConfig,
    );

    const captured: CapturedResponse = {
      status: 0,
      headers: {},
      body: undefined,
    };
    const c = {
      req: {
        method: "POST",
        path: "/v1/generate",
        url: "https://api.acme.test/v1/generate",
        header: () => undefined,
        query: (() => ({})) as never,
        json: async () => ({ model: "flux", max_tokens: 512 }),
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
    expect(challenge.extensions?.[KEY]).toEqual({
      info: { model: "flux", max_tokens: 512 },
    });
  });
});

describe("the resolved blob reaches settlement", () => {
  it("is echoed by a real buyer and relayed on verify and settle", async () => {
    const middleware = weftPaymentMiddleware(routesWith(fromBody), baseConfig);
    const challenge = decodeChallenge(await driveExpress(middleware));

    const payload = await buyerClient().createPaymentPayload(challenge);
    expect(payload.extensions?.[KEY]).toEqual({
      info: { model: "flux", max_tokens: 512 },
    });

    const paid = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(paid.status).toBe(200);
    for (const suffix of ["/verify", "/settle"]) {
      const wire = recorded.find((request) => request.url.endsWith(suffix));
      const body = wire?.body as {
        paymentPayload: { extensions: Record<string, unknown> };
      };
      expect(body.paymentPayload.extensions[KEY]).toEqual({
        info: { model: "flux", max_tokens: 512 },
      });
    }
  });

  /**
   * The determinism rule, pinned as behaviour. Upstream rebuilds the challenge
   * for the paid retry and compares it against what the buyer echoed, so a
   * callback that answers differently for the same request costs the seller
   * the payment, not just the blob.
   */
  it("rejects the payment when the callback is not deterministic", async () => {
    let call = 0;
    const middleware = weftPaymentMiddleware(
      routesWith(() => ({ info: { nonce: call++ } })),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));
    const payload = await buyerClient().createPaymentPayload(challenge);

    const paid = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(paid.status).toBe(402);
    expect(recorded.some((request) => request.url.endsWith("/settle"))).toBe(
      false,
    );
  });
});

describe("a callback that cannot ship costs the blob, never the payment", () => {
  /**
   * Every case here must leave a challenge a buyer can still parse and pay:
   * the key goes, the sale does not.
   *
   * @param extension - The misbehaving callback
   * @returns The decoded challenge
   */
  async function challengeFor(extension: unknown): Promise<PaymentRequired> {
    const middleware = weftPaymentMiddleware(routesWith(extension), {
      ...baseConfig,
      productId: "prod_9f2c",
    });
    return decodeChallenge(await driveExpress(middleware));
  }

  it("drops the key when the callback throws", async () => {
    const challenge = await challengeFor(() => {
      throw new Error("upstream pricing down");
    });

    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toBeDefined();
    expect(warnings.join("\n")).toContain("upstream pricing down");
  });

  it("drops the key, silently, when the callback opts out", async () => {
    const challenge = await challengeFor(() => undefined);

    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("drops a value the extensions channel cannot carry", async () => {
    const challenge = await challengeFor(() => "just a string");

    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(warnings.join("\n")).toContain("a string");
  });

  it("drops a value JSON cannot carry", async () => {
    const challenge = await challengeFor(() => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      return circular;
    });

    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(warnings.join("\n")).toContain("JSON cannot carry");
  });

  it("drops a toJSON that resolves to something other than an object", async () => {
    const challenge = await challengeFor(() => ({
      toJSON: () => "not an object after all",
    }));

    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(warnings.join("\n")).toContain("a string");
  });

  it("drops a blob over the facilitator relay cap, keeping weft.product", async () => {
    const challenge = await challengeFor(() => ({
      info: { blob: "x".repeat(MAX_EXTENSION_BYTES) },
    }));

    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toBeDefined();
    expect(warnings.join("\n")).toContain("relay cap");
  });

  /**
   * The cap the facilitator enforces is on the serialized extensions *object*,
   * not on one value, and it omits every extension when the object is over.
   * A blob that fits on its own but not beside `weft.product` and its own key
   * name must therefore still be dropped — otherwise the seller loses the
   * product declaration to save a display blob.
   */
  it("measures the whole extensions object, not the value alone", async () => {
    const alone = MAX_EXTENSION_BYTES - 64;
    const challenge = await challengeFor(() => ({
      info: { blob: "x".repeat(alone) },
    }));

    const value = JSON.stringify({ info: { blob: "x".repeat(alone) } });
    expect(value.length).toBeLessThan(MAX_EXTENSION_BYTES);
    expect(challenge.extensions?.[KEY]).toBeUndefined();
    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toBeDefined();
    expect(warnings.join("\n")).toContain("relay cap");
  });

  it("warns once for a repeated failure, not once per request", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith(() => {
        throw new Error("upstream pricing down");
      }),
      baseConfig,
    );
    await driveExpress(middleware);
    await driveExpress(middleware);

    expect(
      warnings.filter((line) => line.includes("upstream pricing down")),
    ).toHaveLength(1);
  });

  /**
   * De-duplication has to key on the problem, not on the message: a failure
   * carrying a request id would otherwise log every request and grow the
   * sink's memory forever — a leak in a payment path, dressed as
   * de-duplication.
   */
  it("warns once even when the failure message changes every request", async () => {
    let attempt = 0;
    const middleware = weftPaymentMiddleware(
      routesWith(() => {
        throw new Error(`upstream pricing down (request ${attempt++})`);
      }),
      baseConfig,
    );
    await driveExpress(middleware);
    await driveExpress(middleware);
    await driveExpress(middleware);

    expect(
      warnings.filter((line) => line.includes("upstream pricing down")),
    ).toHaveLength(1);
  });
});

/**
 * The hook advertises the value JSON round-trips to, never the object the
 * callback handed it, because upstream checks the buyer's echo against what
 * was advertised — and the buyer only ever saw the JSON.
 *
 * The two halves of that check behave differently, which is why both cases
 * are pinned here. A *value* that JSON rewrites is absorbed: upstream's
 * `deepEqual` normalizes through `JSON.stringify` itself, so an advertised
 * `NaN` still matches an echoed `null`. A *field* JSON omits is not: the
 * subset check reads the missing key as a mismatch and rejects the payment.
 * So a callback that returns a function-valued field is the case that costs
 * the sale — exactly what the failure posture promises never happens.
 */
describe("the advertised value is what the wire carries", () => {
  it("normalizes a value the way JSON does", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith(() => ({ info: { model: "flux", ratio: NaN } })),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({
      info: { model: "flux", ratio: null },
    });
  });

  it("settles a payment whose blob carried a field JSON omits", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith(() => ({ info: { model: "flux", render: () => "nope" } })),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));
    expect(challenge.extensions?.[KEY]).toEqual({ info: { model: "flux" } });

    const payload = await buyerClient().createPaymentPayload(challenge);
    const paid = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(paid.status).toBe(200);
    expect(recorded.some((request) => request.url.endsWith("/settle"))).toBe(
      true,
    );
  });
});

/**
 * `weft.request` is the one named key this mechanism ships, and the shape a
 * consumer can actually be told about: the SDK owns the envelope, so the
 * callback returns `info` alone and the published schema always travels with
 * it. Everything else keeps the free-form contract, which is what makes it an
 * escape hatch rather than the default.
 */
describe("the named weft.request key carries its own contract", () => {
  /**
   * Drive one challenge whose named key is resolved per request.
   *
   * @param extension - The callback declared under `weft.request`
   * @returns The decoded challenge
   */
  async function namedChallenge(extension: unknown): Promise<PaymentRequired> {
    const middleware = weftPaymentMiddleware(
      {
        "POST /v1/generate": {
          accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: "$0.01",
          },
          extensions: { [WEFT_REQUEST_EXTENSION_KEY]: extension },
        },
      } as WeftRoutesConfig,
      { ...baseConfig, type: "api", productId: "prod_9f2c" },
    );
    return decodeChallenge(await driveExpress(middleware));
  }

  it("wraps what the callback returns as info, beside the schema", async () => {
    const challenge = await namedChallenge(
      async (context: HTTPRequestContext) => {
        const body = (await context.adapter.getBody()) as { model: string };
        return { model: body.model };
      },
    );

    expect(challenge.extensions?.[WEFT_REQUEST_EXTENSION_KEY]).toEqual({
      info: { model: "flux" },
      schema: WEFT_REQUEST_INFO_SCHEMA,
    });
  });

  it("publishes an open info contract, unlike weft.product", async () => {
    const challenge = await namedChallenge(() => ({ model: "flux" }));

    const extension = challenge.extensions?.[WEFT_REQUEST_EXTENSION_KEY] as {
      schema: Record<string, unknown>;
    };
    expect(extension.schema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    // Deliberately open: what a request asked for is the seller's vocabulary,
    // so the contract states a posture, not a field list.
    expect(extension.schema.additionalProperties).toBe(true);
    expect(extension.schema.description).toContain("display only");
  });

  it("sits beside weft.product, which stays fixed at boot", async () => {
    const challenge = await namedChallenge(() => ({ model: "flux" }));

    expect(
      (challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY] as { info: unknown })
        .info,
    ).toEqual({ kind: "api", product_id: "prod_9f2c" });
  });

  it("leaves any other key's value exactly as the seller built it", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith(() => ({ info: { model: "flux" }, schema: { own: true } })),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({
      info: { model: "flux" },
      schema: { own: true },
    });
  });

  it("counts the envelope against the relay cap", async () => {
    const challenge = await namedChallenge(() => ({
      blob: "x".repeat(MAX_EXTENSION_BYTES - 64),
    }));

    expect(challenge.extensions?.[WEFT_REQUEST_EXTENSION_KEY]).toBeUndefined();
    expect(challenge.extensions?.[WEFT_PRODUCT_EXTENSION_KEY]).toBeDefined();
    expect(warnings.join("\n")).toContain("relay cap");
  });

  it("is echoed with its schema and reaches the facilitator", async () => {
    const middleware = weftPaymentMiddleware(
      {
        "POST /v1/generate": {
          accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: "$0.01",
          },
          extensions: {
            [WEFT_REQUEST_EXTENSION_KEY]: () => ({ model: "flux" }),
          },
        },
      } as WeftRoutesConfig,
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));
    const payload = await buyerClient().createPaymentPayload(challenge);

    const paid = await driveExpress(middleware, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payload) },
      handler: true,
    });

    expect(paid.status).toBe(200);
    const settle = recorded.find((request) => request.url.endsWith("/settle"));
    const body = settle?.body as {
      paymentPayload: { extensions: Record<string, unknown> };
    };
    expect(body.paymentPayload.extensions[WEFT_REQUEST_EXTENSION_KEY]).toEqual({
      info: { model: "flux" },
      schema: WEFT_REQUEST_INFO_SCHEMA,
    });
  });
});

describe("routes without a callback are untouched", () => {
  it("registers nothing and still ships static extensions", async () => {
    const middleware = weftPaymentMiddleware(
      routesWith({ info: { note: "static" } }),
      baseConfig,
    );
    const challenge = decodeChallenge(await driveExpress(middleware));

    expect(challenge.extensions?.[KEY]).toEqual({ info: { note: "static" } });
    expect(warnings).toEqual([]);
  });
});
