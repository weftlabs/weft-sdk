import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  request as httpRequest,
} from "node:http";
import type {
  Network,
  PaymentFlowName,
  PaymentPayload,
  PaymentRequirements,
  Price,
  ResourceServerExtension,
  SchemeNetworkServer,
} from "@x402/core/types";
import {
  type CompletedSettlement,
  type HTTPTransportContext,
  type PaymentCancellationDispatcher,
  SETTLEMENT_OVERRIDES_HEADER,
  type SettleContext,
  x402ResourceServer,
} from "@x402/core/server";
import { safeBase64Encode } from "@x402/core/utils";
import express from "express";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { weftPaymentMiddleware } from "../src/facilitator/middleware/express";
import { weftPaymentMiddlewareHono } from "../src/facilitator/middleware/hono";
import type { PaymentResumeCandidate } from "../src/facilitator/middleware/replay";

/**
 * A route handler can settle less than the buyer authorised by writing a
 * `Settlement-Overrides` response header. `@x402/core` only ever reads that
 * header off the `transportContext` argument of `processSettlement`, so an
 * adapter that omits the argument silently charges the full signed amount —
 * which turns `upto` into `exact` and is invisible from the outside: the 402
 * challenge, the verify call and the response body all still look correct.
 *
 * These tests pin the forwarding, not the shape of the challenge.
 */

const FACILITATOR_URL = "http://facilitator.test";
const NETWORK = "eip155:84532";
const PAY_TO = "0x000000000000000000000000000000000000dEaD";
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** The buyer authorises this. */
const CEILING_ATOMIC = "44001";
/** The handler meters this much actually used. */
const METERED_USD = "$0.008800";
const METERED_ATOMIC = "8800";
const EXTENSION_KEY = "acme.metering";
const EXTENSION_DECLARATION = { info: { mode: "usage" } };

const SUPPORTED_BODY = JSON.stringify({
  kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
});

/**
 * A minimal scheme server. Signature verification belongs to the facilitator,
 * which is stubbed here, so the scheme only has to price and pass through —
 * keeping the test independent of `@x402/evm` and of EVM specifics.
 *
 * `getAssetDecimals` is not optional in practice: core throws on a `$…`
 * settlement override when a scheme cannot supply decimals.
 */
class StubScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  readonly defaultAssetTransferMethod = "authorization";
  readonly paymentFlows;

  constructor(defaultFlow: PaymentFlowName = "authorization") {
    this.paymentFlows = {
      authorization: { supported: [defaultFlow], default: defaultFlow },
    };
  }

  /**
   * @param asset - Asset address, ignored; the stub only serves USDC
   * @returns USDC's decimal places
   */
  getAssetDecimals(): number {
    return 6;
  }

  /**
   * @param price - A `$…` price string
   * @returns The price converted to atomic units of the stub asset
   */
  async parsePrice(price: Price): Promise<{ amount: string; asset: string }> {
    const dollars = Number(String(price).replace("$", ""));
    return { amount: String(Math.round(dollars * 1e6)), asset: ASSET };
  }

  /**
   * @param paymentRequirements - Requirements with amount and asset resolved
   * @returns The requirements unchanged
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
  ): Promise<PaymentRequirements> {
    return paymentRequirements;
  }

  async enrichSettlementPayload(context: SettleContext): Promise<void> {
    settlementTransportContexts.push(
      context.transportContext as HTTPTransportContext,
    );
  }
}

/** Bodies POSTed to the facilitator `/settle`, in order. */
let settleBodies: Record<string, unknown>[] = [];
let verifyCalls = 0;
let settlementTransportContexts: HTTPTransportContext[] = [];

/**
 * Stub the facilitator: `/supported` advertises exact, `/verify` approves, and
 * `/settle` records the body it was handed and reports the configured result.
 */
function stubFacilitator(
  settleResult:
    | boolean
    | "malformed"
    | "timeout"
    | "unavailable"
    | "unavailable-empty"
    | "unavailable-html"
    | "unavailable-malformed"
    | "pending"
    | "terminal-4xx" = true,
  verifyValid = true,
): void {
  settleBodies = [];
  verifyCalls = 0;
  settlementTransportContexts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/supported")) {
        return new Response(SUPPORTED_BODY, { status: 200 });
      }
      if (href.endsWith("/verify")) {
        verifyCalls += 1;
        return new Response(
          JSON.stringify({
            isValid: verifyValid,
            payer: "0xpayer",
            ...(!verifyValid && { invalidReason: "nonce_already_used" }),
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/settle")) {
        settleBodies.push(JSON.parse(String(init?.body ?? "{}")));
        if (settleResult === "timeout") {
          throw new DOMException("The operation was aborted", "AbortError");
        }
        if (settleResult === "pending" && settleBodies.length === 1) {
          return new Response(
            JSON.stringify({
              success: false,
              errorReason: "settlement_pending",
              transaction: "0xbroadcast",
              network: NETWORK,
            }),
            { status: 503 },
          );
        }
        if (settleResult === "unavailable") {
          return new Response(
            JSON.stringify({
              success: false,
              errorReason: "temporarily_unavailable",
              transaction: "",
              network: NETWORK,
            }),
            { status: 503, headers: { "retry-after": "7" } },
          );
        }
        if (settleResult === "unavailable-empty") {
          return new Response(null, { status: 503 });
        }
        if (settleResult === "unavailable-html") {
          return new Response("<h1>down</h1>", {
            status: 503,
            headers: { "content-type": "text/html" },
          });
        }
        if (settleResult === "unavailable-malformed") {
          return new Response("{not-json", { status: 503 });
        }
        if (settleResult === "terminal-4xx") {
          return new Response(
            JSON.stringify({
              success: false,
              errorReason: "insufficient_funds",
              transaction: "",
              network: NETWORK,
            }),
            { status: 400 },
          );
        }
        return new Response(
          JSON.stringify(
            settleResult === "malformed"
              ? { success: true, network: NETWORK }
              : settleResult === true || settleResult === "pending"
                ? {
                    success: true,
                    transaction: "0xtx",
                    network: NETWORK,
                  }
                : {
                    success: false,
                    errorReason: "insufficient_funds",
                    transaction: "",
                    network: NETWORK,
                  },
          ),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    }),
  );
}

const requirements = {
  scheme: "exact",
  network: NETWORK,
  amount: CEILING_ATOMIC,
  asset: ASSET,
  payTo: PAY_TO,
  maxTimeoutSeconds: 300,
  extra: { name: "USDC", version: "2" },
};

type CustomFailure = boolean | "text" | { body: unknown; contentType: string };

function routes(customFailure: CustomFailure = false, method = "GET") {
  return {
    [`${method} /quote`]: {
      accepts: {
        scheme: "exact",
        network: NETWORK,
        payTo: PAY_TO,
        price: "$0.044001",
      },
      extensions: {
        [EXTENSION_KEY]: () => EXTENSION_DECLARATION,
      },
      ...(customFailure && {
        settlementFailedResponseBody: () => ({
          contentType:
            typeof customFailure === "object"
              ? customFailure.contentType
              : customFailure === "text"
                ? "text/plain; charset=utf-8"
                : "text/html; charset=utf-8",
          body:
            typeof customFailure === "object"
              ? customFailure.body
              : customFailure === "text"
                ? "facilitator says retry later"
                : "<h1>Try another wallet</h1>",
        }),
      }),
    },
  };
}

interface ReplayResult {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  declaredExtensions?: Record<string, unknown>;
  beforeHandlerSettlement?: CompletedSettlement;
  cancellationDispatcher?: PaymentCancellationDispatcher;
}

type ResumeVerifiedPayment = (
  context: unknown,
  candidate: PaymentResumeCandidate,
) => ReplayResult | undefined | Promise<ReplayResult | undefined>;

function config(
  upfront = false,
  resumeVerifiedPayment?: ResumeVerifiedPayment,
) {
  return {
    apiKey: "ax_live_test",
    facilitator: { url: FACILITATOR_URL },
    name: "Test API",
    type: "api" as const,
    resumeVerifiedPayment,
    schemes: [
      {
        network: NETWORK,
        server: new StubScheme(upfront ? "upfront" : "authorization"),
      },
    ],
  };
}

/** A payment header the buyer would send after signing the ceiling. */
function paymentPayload(upfront = false): PaymentPayload {
  return {
    x402Version: 2,
    accepted: {
      ...requirements,
      ...(upfront && {
        extra: { ...requirements.extra, paymentFlow: "upfront" },
      }),
    },
    payload: {
      signature: `0x${"ab".repeat(65)}`,
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: PAY_TO,
        value: CEILING_ATOMIC,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: `0x${"cd".repeat(32)}`,
      },
    },
  };
}

function paymentHeader(upfront = false): string {
  return safeBase64Encode(JSON.stringify(paymentPayload(upfront)));
}

/**
 * Drive one paid request through the Hono middleware, with a route handler
 * that optionally meters the charge down.
 *
 * The Hono context is hand-rolled rather than imported, matching the other
 * middleware tests and keeping `hono` out of the SDK's dev dependencies.
 *
 * @param setOverride - Whether the handler writes a settlement override
 * @returns The response the middleware left on the context
 */
async function drivePaidRequest(
  setOverride: boolean,
  options: {
    upfront?: boolean;
    handlerStatus?: number;
    customFailure?: CustomFailure;
    immutableResponse?: boolean;
    resumeVerifiedPayment?: ResumeVerifiedPayment;
    handlerRuns?: { count: number };
    body?: string;
    cacheControl?: string;
    paymentHeader?: string;
    method?: string;
  } = {},
): Promise<Response | undefined> {
  const middleware = weftPaymentMiddlewareHono(
    routes(options.customFailure, options.method?.toUpperCase()),
    config(options.upfront, options.resumeVerifiedPayment),
  );

  const c = {
    req: {
      method: options.method ?? "GET",
      path: "/quote",
      url: "https://api.acme.test/quote",
      header: (name: string) =>
        name.toLowerCase() === "payment-signature"
          ? (options.paymentHeader ?? paymentHeader(options.upfront))
          : undefined,
      query: (() => ({})) as never,
      json: async () => undefined,
    },
    res: undefined as Response | undefined,
    responseHeaders: new Headers(),
    header(name: string, value: string | undefined) {
      if (value === undefined) this.responseHeaders.delete(name);
      else this.responseHeaders.set(name, value);
    },
    html(body: string, status?: number) {
      return new Response(body, { status, headers: this.responseHeaders });
    },
    json(body: unknown, status?: number) {
      return new Response(JSON.stringify(body), {
        status,
        headers: this.responseHeaders,
      });
    },
  };

  // Stands in for the protected route handler.
  const returned = await middleware(c, async () => {
    if (options.handlerRuns) options.handlerRuns.count += 1;
    const headers = new Headers({ "content-type": "application/json" });
    if (options.cacheControl)
      headers.set("cache-control", options.cacheControl);
    if (setOverride) {
      headers.set(
        SETTLEMENT_OVERRIDES_HEADER,
        JSON.stringify({ amount: METERED_USD }),
      );
    }
    if (options.immutableResponse) {
      c.res = Response.redirect("https://api.acme.test/complete");
      Object.defineProperty(c.res, "status", {
        value: options.handlerStatus ?? 200,
      });
    } else {
      c.res = new Response(options.body ?? JSON.stringify({ ok: true }), {
        status: options.handlerStatus ?? 200,
        headers,
      });
    }
  });

  return returned instanceof Response ? returned : c.res;
}

async function driveExpressRequest(
  setOverride: boolean,
  options: {
    upfront?: boolean;
    handlerStatus?: number;
    customFailure?: CustomFailure;
    errors?: unknown[];
    writeHeadStatus?: number;
    writeHeadHeaders?: Record<string, string>;
    resumeVerifiedPayment?: ResumeVerifiedPayment;
    handlerRuns?: { count: number };
    chunks?: unknown[];
    cacheControl?: string;
    routeHeaders?: Record<string, string | string[]>;
    handlerThrows?: Error;
    paymentResponseBeforeError?: unknown[];
    paymentHeader?: string;
    method?: string;
  } = {},
): Promise<{
  status: number;
  headers: Record<string, string | string[]>;
  body: unknown;
  emittedChunks: unknown[];
}> {
  const middleware = weftPaymentMiddleware(
    routes(options.customFailure, options.method?.toUpperCase()),
    config(options.upfront, options.resumeVerifiedPayment),
  );
  const headers: Record<string, string | string[]> = {};
  let body: unknown;
  const emittedChunks: unknown[] = [];
  const req = {
    method: options.method ?? "GET",
    path: "/quote",
    protocol: "https",
    headers: {
      host: "api.acme.test",
      "payment-signature":
        options.paymentHeader ?? paymentHeader(options.upfront),
    },
    query: {},
    header(name: string) {
      return this.headers[name.toLowerCase() as keyof typeof this.headers];
    },
  };
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    getHeaders: () => headers,
    removeHeader(name: string) {
      delete headers[name.toLowerCase()];
    },
    send(value: unknown) {
      body = value;
      return res;
    },
    json(value: unknown) {
      body = JSON.stringify(value);
      return res;
    },
    writeHead(
      statusCode: number,
      statusMessageOrHeaders?: string | Record<string, string>,
      maybeHeaders?: Record<string, string>,
    ) {
      res.statusCode = statusCode;
      const writeHeadHeaders =
        typeof statusMessageOrHeaders === "string"
          ? maybeHeaders
          : statusMessageOrHeaders;
      for (const [name, value] of Object.entries(writeHeadHeaders ?? {})) {
        res.setHeader(name, value);
      }
      return res;
    },
    write(chunk: unknown) {
      emittedChunks.push(chunk);
      return true;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) emittedChunks.push(chunk);
      return res;
    },
    flushHeaders: () => undefined,
  };

  await middleware(req, res, (error?: unknown) => {
    if (error) {
      options.errors?.push(error);
      if (options.handlerThrows) {
        options.paymentResponseBeforeError?.push(
          res.getHeaders()["payment-response"],
        );
        res.statusCode = 503;
        res.setHeader("Cache-Control", "public, max-age=60");
        res.setHeader("X-Error-Code", "route_failed");
        res.end(JSON.stringify({ error: "handler_failed" }));
      }
      return;
    }
    if (options.handlerRuns) options.handlerRuns.count += 1;
    if (options.writeHeadStatus !== undefined) {
      res.writeHead(options.writeHeadStatus, options.writeHeadHeaders);
    } else {
      res.statusCode = options.handlerStatus ?? 200;
    }
    if (setOverride) {
      res.setHeader(
        SETTLEMENT_OVERRIDES_HEADER,
        JSON.stringify({ amount: METERED_USD }),
      );
    }
    if (options.cacheControl) {
      res.setHeader("cache-control", options.cacheControl);
    }
    for (const [name, value] of Object.entries(options.routeHeaders ?? {})) {
      res.setHeader(name, value);
    }
    if (options.handlerThrows) throw options.handlerThrows;
    for (const chunk of options.chunks?.slice(0, -1) ?? []) res.write(chunk);
    const finalChunk = options.chunks?.at(-1);
    res.end(finalChunk);
  });

  return { status: res.statusCode, headers, body, emittedChunks };
}

function captureSettlementDeclarations(): unknown[] {
  const declarations: unknown[] = [];
  const registerExtension = x402ResourceServer.prototype.registerExtension;
  vi.spyOn(
    x402ResourceServer.prototype,
    "registerExtension",
  ).mockImplementation(function (
    this: x402ResourceServer,
    extension: ResourceServerExtension,
  ) {
    if (extension.key === EXTENSION_KEY) {
      extension.hooks = {
        ...extension.hooks,
        onBeforeSettle: async (declaration) => {
          declarations.push(declaration);
        },
      };
    }
    return registerExtension.call(this, extension);
  });
  return declarations;
}

function captureCancellations(): unknown[] {
  const cancellations: unknown[] = [];
  const registerExtension = x402ResourceServer.prototype.registerExtension;
  vi.spyOn(
    x402ResourceServer.prototype,
    "registerExtension",
  ).mockImplementation(function (
    this: x402ResourceServer,
    extension: ResourceServerExtension,
  ) {
    if (extension.key === EXTENSION_KEY) {
      extension.hooks = {
        ...extension.hooks,
        onVerifiedPaymentCanceled: async (_declaration, context) => {
          cancellations.push(context);
        },
      };
    }
    return registerExtension.call(this, extension);
  });
  return cancellations;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("settlement overrides reach the facilitator", () => {
  it("settles the metered amount when the handler sets the header", async () => {
    stubFacilitator();

    const response = await drivePaidRequest(true);

    expect(response?.status).toBe(200);
    expect(settleBodies).toHaveLength(1);

    const settled = settleBodies[0] as {
      paymentRequirements?: { amount?: string };
    };
    // The buyer signed 44001; only what was used may be drawn.
    expect(settled.paymentRequirements?.amount).toBe(METERED_ATOMIC);
  });

  it("settles the full authorised amount when the handler sets no header", async () => {
    stubFacilitator();

    const response = await drivePaidRequest(false);

    expect(response?.status).toBe(200);
    expect(settleBodies).toHaveLength(1);

    const settled = settleBodies[0] as {
      paymentRequirements?: { amount?: string };
    };
    expect(settled.paymentRequirements?.amount).toBe(CEILING_ATOMIC);
  });

  it("settles the metered amount through Express", async () => {
    stubFacilitator();

    const response = await driveExpressRequest(true);

    expect(response.status).toBe(200);
    expect(settleBodies[0]?.paymentRequirements).toMatchObject({
      amount: METERED_ATOMIC,
    });
  });
});

describe("protected request method reaches settlement", () => {
  it.each([
    ["Hono", false],
    ["Express", false],
    ["Hono", true],
    ["Express", true],
  ] as const)(
    "uses the seller method for %s upfront=%s instead of buyer metadata",
    async (adapter, upfront) => {
      stubFacilitator();
      const buyerPayload = { ...paymentPayload(upfront), httpMethod: "DELETE" };
      const options = {
        upfront,
        method: "post",
        paymentHeader: safeBase64Encode(JSON.stringify(buyerPayload)),
      };
      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, options)
          : await driveExpressRequest(false, options);

      expect(response.status).toBe(200);
      expect(settleBodies).toHaveLength(1);
      expect(settleBodies[0]?.paymentPayload).toMatchObject({
        httpMethod: "POST",
      });
      expect(buyerPayload.httpMethod).toBe("DELETE");
    },
  );

  it.each(["Hono", "Express"])(
    "clones the verified buyer payload and adds the uppercase live %s method",
    async (adapter) => {
      stubFacilitator();
      const stored: ReplayResult = {
        paymentPayload: paymentPayload(),
        paymentRequirements: requirements,
        declaredExtensions: { [EXTENSION_KEY]: EXTENSION_DECLARATION },
      };

      if (adapter === "Hono") {
        await drivePaidRequest(false, {
          method: "post",
          resumeVerifiedPayment: () => stored,
        });
      } else {
        await driveExpressRequest(false, {
          method: "post",
          resumeVerifiedPayment: () => stored,
        });
      }

      expect(settleBodies[0]?.paymentPayload).toEqual({
        ...stored.paymentPayload,
        httpMethod: "POST",
      });
      expect(stored.paymentPayload).not.toHaveProperty("httpMethod");
    },
  );
});

describe("declared extensions reach settlement hooks", () => {
  it("forwards the Hono route declaration", async () => {
    stubFacilitator();
    const declarations = captureSettlementDeclarations();

    await drivePaidRequest(false);

    expect(declarations).toEqual([EXTENSION_DECLARATION]);
  });

  it("forwards the Express route declaration", async () => {
    stubFacilitator();
    const declarations = captureSettlementDeclarations();

    await driveExpressRequest(false);

    expect(declarations).toEqual([EXTENSION_DECLARATION]);
  });
});

describe("failed settlement response headers", () => {
  it("sends PAYMENT-RESPONSE through Hono", async () => {
    stubFacilitator(false);

    const response = await drivePaidRequest(false);

    expect(response?.status).toBe(402);
    expect(response?.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });

  it("sends PAYMENT-RESPONSE through Express", async () => {
    stubFacilitator(false);

    const response = await driveExpressRequest(false);

    expect(response.status).toBe(402);
    expect(response.headers["payment-response"]).toBeTruthy();
  });
});

describe("before-handler settlement", () => {
  it("returns the completed settlement through Hono", async () => {
    stubFacilitator();

    const response = await drivePaidRequest(false, { upfront: true });

    expect(response?.status).toBe(200);
    expect(response?.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
    expect(settleBodies).toHaveLength(1);
  });

  it("returns the completed settlement through Express", async () => {
    stubFacilitator();

    const response = await driveExpressRequest(false, { upfront: true });

    expect(response.status).toBe(200);
    expect(response.headers["payment-response"]).toBeTruthy();
    expect(settleBodies).toHaveLength(1);
  });

  it("cancels after a Hono handler failure", async () => {
    stubFacilitator();
    const cancellations = captureCancellations();

    const response = await drivePaidRequest(false, {
      upfront: true,
      handlerStatus: 500,
    });

    expect(cancellations).toMatchObject([
      { reason: "handler_failed", responseStatus: 500 },
    ]);
    expect(response?.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });

  it("cancels after an Express handler failure", async () => {
    stubFacilitator();
    const cancellations = captureCancellations();

    const response = await driveExpressRequest(false, {
      upfront: true,
      handlerStatus: 500,
    });

    expect(cancellations).toMatchObject([
      { reason: "handler_failed", responseStatus: 500 },
    ]);
    expect(response.headers["payment-response"]).toBeTruthy();
  });

  it("finalizes a synchronous Express throw after error middleware responds", async () => {
    stubFacilitator();
    const cancellations = captureCancellations();
    const paymentResponseBeforeError: unknown[] = [];
    const routeError = new Error("route failed");

    const response = await driveExpressRequest(true, {
      upfront: true,
      handlerThrows: routeError,
      paymentResponseBeforeError,
      routeHeaders: {
        "Set-Cookie": "success=1",
        Location: "/success",
      },
    });

    expect(paymentResponseBeforeError).toEqual([undefined]);
    expect(cancellations).toHaveLength(1);
    expect(cancellations).toMatchObject([
      { reason: "handler_threw", error: routeError },
    ]);
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("private");
    expect(response.headers["payment-response"]).toBeTruthy();
    expect(response.headers["x-error-code"]).toBe("route_failed");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers.location).toBeUndefined();
    expect(
      response.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()],
    ).toBeUndefined();
    expect(response.emittedChunks).toEqual([
      JSON.stringify({ error: "handler_failed" }),
    ]);
  });
});

describe("buffered Express writeHead", () => {
  it("observes a failure status before deciding whether to settle", async () => {
    stubFacilitator();
    const cancellations = captureCancellations();

    const response = await driveExpressRequest(false, {
      writeHeadStatus: 503,
    });

    expect(response.status).toBe(503);
    expect(cancellations).toMatchObject([
      { reason: "handler_failed", responseStatus: 503 },
    ]);
    expect(settleBodies).toHaveLength(0);
  });

  it("observes settlement overrides passed to writeHead", async () => {
    stubFacilitator();

    await driveExpressRequest(false, {
      writeHeadStatus: 200,
      writeHeadHeaders: {
        [SETTLEMENT_OVERRIDES_HEADER]: JSON.stringify({ amount: METERED_USD }),
      },
    });

    expect(settleBodies[0]?.paymentRequirements).toMatchObject({
      amount: METERED_ATOMIC,
    });
  });
});

describe("immutable Hono responses", () => {
  it("rebuilds a successful response before adding settlement headers", async () => {
    stubFacilitator();

    const response = await drivePaidRequest(false, { immutableResponse: true });

    expect(response?.status).toBe(200);
    expect(response?.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });

  it("rebuilds a failed handler response before adding cancellation headers", async () => {
    stubFacilitator();

    const response = await drivePaidRequest(false, {
      upfront: true,
      handlerStatus: 503,
      immutableResponse: true,
    });

    expect(response?.status).toBe(503);
    expect(response?.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });
});

describe("custom settlement failure responses", () => {
  it("honors Core's Hono response instructions", async () => {
    stubFacilitator(false);

    const response = await drivePaidRequest(false, { customFailure: true });

    expect(response?.status).toBe(402);
    expect(response?.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response?.text()).toBe("<h1>Try another wallet</h1>");
  });

  it("honors Core's Express response instructions", async () => {
    stubFacilitator(false);

    const response = await driveExpressRequest(false, { customFailure: true });

    expect(response.status).toBe(402);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toBe("<h1>Try another wallet</h1>");
  });

  it.each(["Hono", "Express"])(
    "sends Core's text/plain body verbatim through %s",
    async (adapter) => {
      stubFacilitator(false);

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, { customFailure: "text" })
          : await driveExpressRequest(false, { customFailure: "text" });
      const headers =
        response instanceof Response ? response.headers : response.headers;

      expect(
        headers instanceof Headers
          ? headers.get("content-type")
          : headers["content-type"],
      ).toBe("text/plain; charset=utf-8");
      expect(
        response instanceof Response ? await response.text() : response.body,
      ).toBe("facilitator says retry later");
    },
  );

  it.each(["Hono", "Express"])(
    "sends an upfront Core text/plain failure verbatim through %s",
    async (adapter) => {
      stubFacilitator(false);

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, {
              upfront: true,
              customFailure: "text",
            })
          : await driveExpressRequest(false, {
              upfront: true,
              customFailure: "text",
            });
      const headers =
        response instanceof Response ? response.headers : response.headers;

      expect(
        headers instanceof Headers
          ? headers.get("content-type")
          : headers["content-type"],
      ).toBe("text/plain; charset=utf-8");
      expect(
        response instanceof Response ? await response.text() : response.body,
      ).toBe("facilitator says retry later");
    },
  );

  it.each([
    ["Buffer", Buffer.from([0, 1, 127, 255])],
    ["Uint8Array", new Uint8Array([0, 1, 127, 255])],
    ["ArrayBuffer", new Uint8Array([0, 1, 127, 255]).buffer],
    ["Blob", new Blob([new Uint8Array([0, 1, 127, 255])])],
  ])(
    "sends %s failure bytes unchanged through Hono and Express",
    async (_, body) => {
      for (const adapter of ["Hono", "Express"]) {
        stubFacilitator(false);
        const customFailure = { contentType: "application/octet-stream", body };
        const response =
          adapter === "Hono"
            ? await drivePaidRequest(false, { customFailure })
            : await driveExpressRequest(false, { customFailure });

        if (response instanceof Response) {
          expect(response.headers.get("content-type")).toBe(
            "application/octet-stream",
          );
          expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([0, 1, 127, 255]),
          );
        } else {
          expect(response.headers["content-type"]).toBe(
            "application/octet-stream",
          );
          const bytes = Buffer.isBuffer(response.body)
            ? response.body
            : new Uint8Array(response.body as ArrayBuffer);
          expect([...bytes]).toEqual([0, 1, 127, 255]);
        }
      }
    },
  );
});

describe("facilitator boundary errors", () => {
  it("lets Hono handle a typed Core error", async () => {
    stubFacilitator("malformed");

    await expect(drivePaidRequest(false)).rejects.toMatchObject({
      name: "FacilitatorResponseError",
    });
  });

  it("passes a typed Core error to Express", async () => {
    stubFacilitator("malformed");
    const errors: unknown[] = [];

    const response = await driveExpressRequest(false, { errors });

    expect(response.status).toBe(200);
    expect(errors).toMatchObject([{ name: "FacilitatorResponseError" }]);
  });
});

describe("verified payment replay", () => {
  function storedReplay(): ReplayResult {
    return {
      paymentPayload: paymentPayload(),
      paymentRequirements: requirements,
      declaredExtensions: { [EXTENSION_KEY]: EXTENSION_DECLARATION },
    };
  }

  it.each(["Hono", "Express"])(
    "passes a parsed v2 payment candidate to the %s resume callback",
    async (adapter) => {
      stubFacilitator(true, false);
      const candidates: PaymentResumeCandidate[] = [];
      const resumeVerifiedPayment: ResumeVerifiedPayment = (
        _context,
        candidate,
      ) => {
        candidates.push(candidate);
        return storedReplay();
      };

      if (adapter === "Hono") {
        await drivePaidRequest(false, { resumeVerifiedPayment });
      } else {
        await driveExpressRequest(false, { resumeVerifiedPayment });
      }

      expect(candidates).toEqual([
        {
          paymentPayload: paymentPayload(),
          paymentRequirements: requirements,
        },
      ]);
    },
  );

  it.each(["Hono", "Express"])(
    "does not offer a malformed payment to the %s resume callback",
    async (adapter) => {
      stubFacilitator();
      const resumeVerifiedPayment = vi.fn(() => storedReplay());
      const malformed = safeBase64Encode(
        JSON.stringify({ x402Version: 2, payload: {} }),
      );

      if (adapter === "Hono") {
        await drivePaidRequest(false, {
          resumeVerifiedPayment,
          paymentHeader: malformed,
        });
      } else {
        await driveExpressRequest(false, {
          resumeVerifiedPayment,
          paymentHeader: malformed,
        });
      }

      expect(resumeVerifiedPayment).not.toHaveBeenCalled();
    },
  );

  it("retries Hono settlement without verifying a consumed nonce", async () => {
    stubFacilitator(true, false);
    const stored = storedReplay();
    const handlerRuns = { count: 0 };

    const response = await drivePaidRequest(true, {
      resumeVerifiedPayment: () => stored,
      handlerRuns,
    });

    expect(response?.status).toBe(200);
    expect(verifyCalls).toBe(0);
    expect(handlerRuns.count).toBe(1);
    expect(settleBodies[0]?.paymentPayload).toEqual({
      ...stored.paymentPayload,
      httpMethod: "GET",
    });
    expect(stored.paymentPayload).not.toHaveProperty("httpMethod");
    expect(settleBodies[0]?.paymentRequirements).toMatchObject({
      amount: METERED_ATOMIC,
    });
  });

  it("retries Express settlement without verifying a consumed nonce", async () => {
    stubFacilitator(true, false);
    const stored = storedReplay();
    const handlerRuns = { count: 0 };

    const response = await driveExpressRequest(true, {
      resumeVerifiedPayment: () => stored,
      handlerRuns,
    });

    expect(response.status).toBe(200);
    expect(verifyCalls).toBe(0);
    expect(handlerRuns.count).toBe(1);
    expect(settleBodies[0]?.paymentPayload).toEqual({
      ...stored.paymentPayload,
      httpMethod: "GET",
    });
    expect(stored.paymentPayload).not.toHaveProperty("httpMethod");
    expect(settleBodies[0]?.paymentRequirements).toMatchObject({
      amount: METERED_ATOMIC,
    });
  });

  it("propagates Hono replay lookup errors", async () => {
    stubFacilitator();

    await expect(
      drivePaidRequest(false, {
        resumeVerifiedPayment: () => {
          throw new Error("replay store unavailable");
        },
      }),
    ).rejects.toThrow("replay store unavailable");
    expect(verifyCalls).toBe(0);
  });

  it("passes Express replay lookup errors to error middleware", async () => {
    stubFacilitator();
    const errors: unknown[] = [];

    await driveExpressRequest(false, {
      resumeVerifiedPayment: () => {
        throw new Error("replay store unavailable");
      },
      errors,
    });

    expect(errors).toMatchObject([{ message: "replay store unavailable" }]);
    expect(verifyCalls).toBe(0);
  });

  it.each(["Hono", "Express"])(
    "restores an upfront receipt through %s without settling again",
    async (adapter) => {
      stubFacilitator();
      const replay = {
        ...storedReplay(),
        beforeHandlerSettlement: {
          phase: "before-handler" as const,
          flow: "upfront" as const,
          requirements,
          result: {
            success: true as const,
            transaction: "0xstored",
            network: NETWORK,
          },
        },
      };

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, {
              upfront: true,
              resumeVerifiedPayment: () => replay,
            })
          : await driveExpressRequest(false, {
              upfront: true,
              resumeVerifiedPayment: () => replay,
            });
      const headers =
        response instanceof Response ? response.headers : response.headers;

      expect(
        headers instanceof Headers
          ? headers.get("payment-response")
          : headers["payment-response"],
      ).toBeTruthy();
      expect(settleBodies).toHaveLength(0);
    },
  );

  it.each(["Hono", "Express"])(
    "restores an upfront receipt and cancellation dispatcher through %s",
    async (adapter) => {
      stubFacilitator();
      const calls: unknown[] = [];
      const beforeHandlerSettlement: CompletedSettlement = {
        phase: "before-handler",
        flow: "upfront",
        requirements,
        result: {
          success: true,
          transaction: "0xstored",
          network: NETWORK,
        },
      };
      const cancellationDispatcher: PaymentCancellationDispatcher = {
        async cancel(options) {
          calls.push(options);
          return beforeHandlerSettlement.result;
        },
      };
      const replay = {
        ...storedReplay(),
        beforeHandlerSettlement,
        cancellationDispatcher,
      };

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, {
              upfront: true,
              handlerStatus: 500,
              resumeVerifiedPayment: () => replay,
            })
          : await driveExpressRequest(false, {
              upfront: true,
              handlerStatus: 500,
              resumeVerifiedPayment: () => replay,
            });

      expect(calls).toMatchObject([
        { reason: "handler_failed", responseStatus: 500 },
      ]);
      const headers =
        response instanceof Response ? response.headers : response.headers;
      expect(
        headers instanceof Headers
          ? headers.get("payment-response")
          : headers["payment-response"],
      ).toBeTruthy();
      expect(settleBodies).toHaveLength(0);
    },
  );

  it.each(["Hono", "Express"])(
    "reconstructs Core cancellation for a resumed upfront failure through %s",
    async (adapter) => {
      stubFacilitator();
      const cancellations = captureCancellations();
      const replay = {
        ...storedReplay(),
        beforeHandlerSettlement: {
          phase: "before-handler" as const,
          flow: "upfront" as const,
          requirements,
          result: {
            success: true as const,
            transaction: "0xstored",
            network: NETWORK,
          },
        },
      };

      if (adapter === "Hono") {
        await drivePaidRequest(false, {
          upfront: true,
          handlerStatus: 500,
          resumeVerifiedPayment: () => replay,
        });
      } else {
        await driveExpressRequest(false, {
          upfront: true,
          handlerStatus: 500,
          resumeVerifiedPayment: () => replay,
        });
      }

      expect(cancellations).toMatchObject([
        { reason: "handler_failed", responseStatus: 500 },
      ]);
      expect(settleBodies).toHaveLength(0);
    },
  );
});

describe("real Hono context settlement failures", () => {
  async function request(settleResult: "unavailable" | false) {
    stubFacilitator(settleResult);
    const app = new Hono();
    app.use("/quote", weftPaymentMiddlewareHono(routes(), config()) as never);
    app.get("/quote", (c) => c.json({ ok: true }));

    return app.request("https://api.acme.test/quote", {
      headers: { "payment-signature": paymentHeader() },
    });
  }

  it("returns Core's terminal 402 without mutating a finalized context", async () => {
    const response = await request(false);

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-response")).toBeTruthy();
  });

  it("returns a retryable 503 without mutating a finalized context", async () => {
    const response = await request("unavailable");

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toEqual({
      error: "facilitator_unavailable",
    });
  });

  it.each([
    [false, 402],
    ["unavailable" as const, 503],
  ])(
    "does not leak route success headers into a %s settlement failure",
    async (settleResult, expectedStatus) => {
      stubFacilitator(settleResult);
      const app = new Hono();
      app.use("/quote", weftPaymentMiddlewareHono(routes(), config()) as never);
      app.get("/quote", (c) => {
        c.header(
          SETTLEMENT_OVERRIDES_HEADER,
          JSON.stringify({ amount: METERED_USD }),
        );
        c.header("Set-Cookie", "session=success");
        c.header("Location", "/success");
        c.header("X-Success-Only", "yes");
        return c.json({ ok: true });
      });

      const response = await app.request("https://api.acme.test/quote", {
        headers: { "payment-signature": paymentHeader() },
      });

      expect(response.status).toBe(expectedStatus);
      expect(Object.fromEntries(response.headers)).toEqual(
        expectedStatus === 503
          ? {
              "cache-control": "private",
              "content-type": "application/json; charset=UTF-8",
              "retry-after": "1",
            }
          : {
              "cache-control": "no-store",
              "content-type": "application/json",
              "payment-response": expect.any(String),
            },
      );
    },
  );

  it.each(["malformed", "timeout"] as const)(
    "clears the finalized route response before a %s settlement error reaches onError",
    async (settleResult) => {
      stubFacilitator(settleResult);
      if (settleResult === "timeout") {
        vi.spyOn(AbortSignal, "timeout").mockReturnValue(
          AbortSignal.abort(new DOMException("timed out", "TimeoutError")),
        );
      }
      const app = new Hono();
      app.onError((_error, c) => {
        c.header("X-Error-Handler", "yes");
        return c.json({ error: "settlement_failed" }, 502);
      });
      app.use("/quote", weftPaymentMiddlewareHono(routes(), config()) as never);
      app.get("/quote", (c) => {
        c.header("Cache-Control", "public, max-age=60");
        c.header(
          SETTLEMENT_OVERRIDES_HEADER,
          JSON.stringify({ amount: METERED_USD }),
        );
        c.header("Set-Cookie", "a=1", { append: true });
        c.header("Set-Cookie", "b=2", { append: true });
        c.header("Location", "/success");
        c.header("X-Success-Only", "yes");
        return c.json({ ok: true });
      });

      const response = await app.request("https://api.acme.test/quote", {
        headers: { "payment-signature": paymentHeader() },
      });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: "settlement_failed",
      });
      expect(Object.fromEntries(response.headers)).toEqual({
        "content-type": "application/json",
        "x-error-handler": "yes",
      });
    },
  );

  it("cancels an already-handled Hono error without invoking onError again", async () => {
    stubFacilitator();
    const cancellations = captureCancellations();
    const routeError = new Error("route failed");
    let onErrorCalls = 0;
    const app = new Hono();
    app.onError((_error, c) => {
      onErrorCalls += 1;
      c.header("X-Error-Handler", "yes");
      c.header("WWW-Authenticate", 'Bearer realm="api"');
      c.header("Retry-After", "30");
      return c.json({ error: "handler_failed" }, 500);
    });
    app.use(
      "/quote",
      weftPaymentMiddlewareHono(routes(), config(true)) as never,
    );
    app.get("/quote", (c) => {
      c.header("Cache-Control", "public, max-age=60");
      c.header(
        SETTLEMENT_OVERRIDES_HEADER,
        JSON.stringify({ amount: METERED_USD }),
      );
      c.header("Set-Cookie", "a=1", { append: true });
      c.header("Set-Cookie", "b=2", { append: true });
      c.header("Location", "/success");
      c.header("X-Success-Only", "yes");
      throw routeError;
    });

    const response = await app.request("https://api.acme.test/quote", {
      headers: { "payment-signature": paymentHeader(true) },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "handler_failed" });
    expect(onErrorCalls).toBe(1);
    expect(cancellations).toHaveLength(1);
    expect(cancellations).toMatchObject([
      { reason: "handler_threw", error: routeError },
    ]);
    expect(response.headers.get("payment-response")).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("private");
    expect(response.headers.get("x-error-handler")).toBe("yes");
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="api"');
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(SETTLEMENT_OVERRIDES_HEADER)).toBeNull();
    expect(response.headers.get("x-success-only")).toBeNull();
  });

  it.each([422, 503] as const)(
    "removes settlement overrides from a direct Hono %s response",
    async (status) => {
      stubFacilitator();
      const app = new Hono();
      app.use(
        "/quote",
        weftPaymentMiddlewareHono(routes(), config(true)) as never,
      );
      app.get("/quote", (c) => {
        c.header(
          SETTLEMENT_OVERRIDES_HEADER,
          JSON.stringify({ amount: METERED_USD }),
        );
        c.header("Cache-Control", "no-store");
        c.header("WWW-Authenticate", 'Bearer realm="api"');
        c.header("Retry-After", "30");
        c.header("Access-Control-Allow-Origin", "https://client.test");
        c.header("Set-Cookie", "error=a", { append: true });
        c.header("Set-Cookie", "error=b", { append: true });
        return c.json({ error: "handler_failed" }, status);
      });

      const response = await app.request("https://api.acme.test/quote", {
        headers: { "payment-signature": paymentHeader(true) },
      });

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        error: "handler_failed",
      });
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer realm="api"',
      );
      expect(response.headers.get("retry-after")).toBe("30");
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://client.test",
      );
      expect(response.headers.getSetCookie()).toEqual(["error=a", "error=b"]);
      expect(response.headers.get("payment-response")).toBeTruthy();
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get(SETTLEMENT_OVERRIDES_HEADER)).toBeNull();
    },
  );
});

describe("real Node response writeHead replay", () => {
  async function requestWithWriteHead(
    headers: string[] | Record<string, string[]>,
  ) {
    stubFacilitator();
    const middleware = weftPaymentMiddleware(routes(), config());
    const server = createServer((request, response) => {
      const req = Object.assign(request, {
        path: "/quote",
        protocol: "http",
        query: {},
        header(name: string) {
          const value = request.headers[name.toLowerCase()];
          return Array.isArray(value) ? value[0] : value;
        },
      });
      const res = Object.assign(response, {
        status(code: number) {
          response.statusCode = code;
          return res;
        },
        send(body: unknown) {
          response.end(body as never);
          return res;
        },
        json(body: unknown) {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(body));
          return res;
        },
      });
      void middleware(req as never, res as never, (error?: unknown) => {
        if (error) {
          response.destroy(error as Error);
          return;
        }
        response.writeHead(200, headers);
        response.end("ok");
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing port");

    try {
      return await new Promise<IncomingMessage>((resolve, reject) => {
        const request = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/quote",
            headers: { "payment-signature": paymentHeader() },
          },
          resolve,
        );
        request.on("error", reject);
        request.end();
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  }

  it("preserves repeated raw header arrays", async () => {
    const response = await requestWithWriteHead([
      "Set-Cookie",
      "a=1",
      "Set-Cookie",
      "b=2",
      "X-Repeat",
      "one",
      "X-Repeat",
      "two",
    ]);

    expect(response.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
    const repeatedHeaders = response.rawHeaders.flatMap((value, index, all) =>
      index % 2 === 0 &&
      ["set-cookie", "x-repeat"].includes(value.toLowerCase())
        ? [value, all[index + 1]]
        : [],
    );
    expect(repeatedHeaders).toEqual([
      "Set-Cookie",
      "a=1",
      "Set-Cookie",
      "b=2",
      "X-Repeat",
      "one",
      "X-Repeat",
      "two",
    ]);
  });

  it("preserves Set-Cookie object arrays", async () => {
    const response = await requestWithWriteHead({
      "Set-Cookie": ["a=1", "b=2"],
    });

    expect(response.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
  });

  it("replays status without restoring public settlement headers", async () => {
    const response = await requestWithWriteHead([
      "Cache-Control",
      "public, max-age=60",
      SETTLEMENT_OVERRIDES_HEADER,
      JSON.stringify({ amount: METERED_USD }),
      "Set-Cookie",
      "a=1",
      "Set-Cookie",
      "b=2",
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("private");
    expect(
      response.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()],
    ).toBeUndefined();
    expect(response.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
  });

  it("restores headers before a handler throw reaches Node error handling", async () => {
    stubFacilitator();
    const middleware = weftPaymentMiddleware(routes(), config(true));
    const server = createServer((request, response) => {
      const req = Object.assign(request, {
        path: "/quote",
        protocol: "http",
        query: {},
        header(name: string) {
          const value = request.headers[name.toLowerCase()];
          return Array.isArray(value) ? value[0] : value;
        },
      });
      const res = Object.assign(response, {
        status(code: number) {
          response.statusCode = code;
          return res;
        },
        send(body: unknown) {
          response.end(body as never);
          return res;
        },
        json(body: unknown) {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(body));
          return res;
        },
      });
      void middleware(req as never, res as never, (error?: unknown) => {
        if (error) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ error: "handler_failed" }));
          return;
        }
        response.setHeader("Cache-Control", "public, max-age=60");
        response.setHeader(
          SETTLEMENT_OVERRIDES_HEADER,
          JSON.stringify({ amount: METERED_USD }),
        );
        response.setHeader("Set-Cookie", ["a=1", "b=2"]);
        response.setHeader("Location", "/success");
        response.setHeader("X-Success-Only", "yes");
        throw new Error("route failed");
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing port");

    try {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/quote",
            headers: { "payment-signature": paymentHeader(true) },
          },
          resolve,
        );
        request.on("error", reject);
        request.end();
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers["payment-response"]).toBeTruthy();
      expect(response.headers["cache-control"]).toBe("private");
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
      expect(
        response.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()],
      ).toBeUndefined();
      expect(response.headers["x-success-only"]).toBeUndefined();
      response.resume();
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});

describe("real Express router error handling", () => {
  async function requestFailure(mode: "throw" | "direct" | "prestatus") {
    stubFacilitator();
    const cancellations = captureCancellations();
    const app = express();
    const router = express.Router();
    let paymentResponseBeforeError: unknown;
    app.use((_request, response, next) => {
      response.setHeader("X-Baseline-Keep", "yes");
      response.setHeader("X-Remove-On-Error", "baseline");
      next();
    });
    app.use(weftPaymentMiddleware(routes(), config(true)) as never);
    router.get("/quote", (_request, response) => {
      response.setHeader("Cache-Control", "public, max-age=60");
      response.setHeader(
        SETTLEMENT_OVERRIDES_HEADER,
        JSON.stringify({ amount: METERED_USD }),
      );
      response.setHeader("Set-Cookie", ["a=1", "b=2"]);
      response.setHeader("Location", "/success");
      response.setHeader("X-Ambiguous-Prestatus", "yes");
      if (mode === "prestatus") {
        response.setHeader("Content-Type", "application/problem+json");
        response.setHeader("WWW-Authenticate", [
          'Bearer realm="api"',
          'Basic realm="api"',
        ]);
        response.setHeader("Retry-After", "30");
        response.setHeader(
          "Access-Control-Allow-Origin",
          "https://client.test",
        );
        response.setHeader("Vary", ["Origin", "Accept-Encoding"]);
        response.setHeader("Allow", ["GET", "HEAD"]);
        response.status(401);
        response.removeHeader("X-Remove-On-Error");
        response.send(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (mode === "direct") {
        response.setHeader("X-Error-Code", "invalid_quote");
        response.setHeader("X-Diagnostic", "quote validation failed");
        response.status(422);
        response.setHeader("WWW-Authenticate", [
          'Bearer realm="api"',
          'Basic realm="api"',
        ]);
        response.setHeader("Retry-After", "30");
        response.setHeader(
          "Access-Control-Allow-Origin",
          "https://client.test",
        );
        response.setHeader("Set-Cookie", ["error=a", "error=b"]);
        response.removeHeader("X-Remove-On-Error");
        response.json({ error: "invalid" });
        return;
      }
      throw new Error("route failed");
    });
    app.use(router);
    app.use((_error, _request, response, _next) => {
      paymentResponseBeforeError = response.getHeader("payment-response");
      response.status(503);
      response.setHeader("Cache-Control", "public, max-age=60");
      response.setHeader("X-Error-Code", "route_failed");
      response.setHeader("X-Error-Detail", "quote generation failed");
      response.setHeader("WWW-Authenticate", [
        'Bearer realm="api"',
        'Basic realm="api"',
      ]);
      response.setHeader("Retry-After", "30");
      response.setHeader("Access-Control-Allow-Origin", "https://client.test");
      response.removeHeader("X-Remove-On-Error");
      response.json({
        error: "handler_failed",
        detail: "quote generation failed",
      });
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing port");

    try {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/quote",
            headers: { "payment-signature": paymentHeader(true) },
          },
          resolve,
        );
        request.on("error", reject);
        request.end();
      });

      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      await once(response, "end");
      return {
        response,
        body: Buffer.concat(chunks).toString("utf8"),
        cancellations,
        paymentResponseBeforeError,
      };
    } finally {
      server.close();
      await once(server, "close");
    }
  }

  it.each([
    [
      "throw",
      503,
      { error: "handler_failed", detail: "quote generation failed" },
    ],
    ["direct", 422, { error: "invalid" }],
    ["prestatus", 401, { error: "unauthorized" }],
  ] as const)(
    "preserves observable failure headers for a %s response",
    async (mode, expectedStatus, expectedBody) => {
      const { response, body, cancellations, paymentResponseBeforeError } =
        await requestFailure(mode);

      expect(response.statusCode).toBe(expectedStatus);
      expect(JSON.parse(body)).toEqual(expectedBody);
      expect(response.headers["content-type"]).toContain(
        mode === "prestatus" ? "application/problem+json" : "application/json",
      );
      expect(response.headers["content-length"]).toBe(
        String(Buffer.byteLength(body)),
      );
      expect(response.headers["www-authenticate"]).toBe(
        'Bearer realm="api", Basic realm="api"',
      );
      expect(response.headers["retry-after"]).toBe("30");
      expect(response.headers["access-control-allow-origin"]).toBe(
        "https://client.test",
      );
      expect(response.headers["set-cookie"]).toBeUndefined();
      if (mode === "prestatus") {
        expect(response.headers.vary).toBe("Origin, Accept-Encoding");
        expect(response.headers.allow).toBe("GET, HEAD");
      }
      if (mode === "direct") {
        expect(response.headers["x-error-code"]).toBe("invalid_quote");
        expect(response.headers["x-diagnostic"]).toBe(
          "quote validation failed",
        );
      }
      if (mode === "throw") {
        expect(paymentResponseBeforeError).toBeUndefined();
        expect(response.headers["x-error-code"]).toBe("route_failed");
        expect(response.headers["x-error-detail"]).toBe(
          "quote generation failed",
        );
      }
      expect(response.headers["x-baseline-keep"]).toBe("yes");
      expect(response.headers["x-remove-on-error"]).toBeUndefined();
      expect(response.headers["payment-response"]).toBeTruthy();
      expect(response.headers["cache-control"]).toBe("private");
      expect(response.headers.location).toBeUndefined();
      expect(
        response.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()],
      ).toBeUndefined();
      expect(response.headers["x-ambiguous-prestatus"]).toBe("yes");
      expect(cancellations).toHaveLength(1);
    },
  );
});

describe("settlement transport response body", () => {
  it("passes a cloned Hono response body to settlement hooks", async () => {
    stubFacilitator();

    const response = await drivePaidRequest(false, { body: "hono body" });

    expect(settlementTransportContexts[0]?.responseBody?.toString("utf8")).toBe(
      "hono body",
    );
    expect(await response?.text()).toBe("hono body");
  });

  it("reconstructs Express write/end chunks without changing output", async () => {
    stubFacilitator();
    const chunks = [
      "express ",
      Buffer.from("buffer "),
      new Uint8Array([111, 107]),
    ];

    const response = await driveExpressRequest(false, { chunks });

    expect(settlementTransportContexts[0]?.responseBody?.toString("utf8")).toBe(
      "express buffer ok",
    );
    expect(response.emittedChunks).toEqual(chunks);
  });

  it("omits an unsafe Express body without changing emitted output", async () => {
    stubFacilitator();
    const chunk = { streamed: true };

    const response = await driveExpressRequest(false, { chunks: [chunk] });

    expect(settlementTransportContexts[0]?.responseBody).toBeUndefined();
    expect(response.emittedChunks).toEqual([chunk]);
  });
});

describe("successful response privacy", () => {
  it.each(["Hono", "Express"])(
    "makes %s responses private and removes settlement overrides",
    async (adapter) => {
      stubFacilitator();

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(true, { cacheControl: "max-age=60" })
          : await driveExpressRequest(true, { cacheControl: "max-age=60" });
      const headers =
        response instanceof Response ? response.headers : response.headers;
      const get = (name: string) =>
        headers instanceof Headers
          ? headers.get(name)
          : headers[name.toLowerCase()];

      expect(get("cache-control")).toContain("private");
      expect(get("cache-control")).toContain("max-age=60");
      expect(get(SETTLEMENT_OVERRIDES_HEADER)).toBeFalsy();
    },
  );

  it("returns exact private headers from a real Hono context", async () => {
    stubFacilitator();
    const app = new Hono();
    app.use("/quote", weftPaymentMiddlewareHono(routes(), config()) as never);
    app.get("/quote", (c) => {
      c.header(
        SETTLEMENT_OVERRIDES_HEADER,
        JSON.stringify({ amount: METERED_USD }),
      );
      c.header("X-Success", "yes");
      return c.json({ ok: true });
    });

    const response = await app.request("https://api.acme.test/quote", {
      headers: { "payment-signature": paymentHeader() },
    });

    expect(Object.fromEntries(response.headers)).toEqual({
      "cache-control": "private",
      "content-type": "application/json",
      "payment-response": expect.any(String),
      "x-success": "yes",
    });
  });
});

describe("facilitator unavailable settlement", () => {
  it("lets Core retry transaction-bearing pending settlement once", async () => {
    stubFacilitator("pending");

    const response = await drivePaidRequest(false);

    expect(settleBodies).toHaveLength(2);
    expect(settleBodies[1]).toEqual(settleBodies[0]);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("payment-response")).toBeTruthy();
  });

  it.each([
    ["Hono", "unavailable-empty"],
    ["Hono", "unavailable-html"],
    ["Hono", "unavailable-malformed"],
    ["Express", "unavailable-empty"],
    ["Express", "unavailable-html"],
    ["Express", "unavailable-malformed"],
  ] as const)(
    "returns upfront %s unstructured %s as a nonterminal 503",
    async (adapter, settleResult) => {
      stubFacilitator(settleResult);

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, { upfront: true })
          : await driveExpressRequest(false, { upfront: true });
      const headers =
        response instanceof Response ? response.headers : response.headers;
      const get = (name: string) =>
        headers instanceof Headers
          ? headers.get(name)
          : headers[name.toLowerCase()];

      expect(
        response instanceof Response ? response.status : response.status,
      ).toBe(503);
      expect(get("retry-after")).toBe("1");
      expect(get("payment-response")).toBeFalsy();
    },
  );

  it.each(["Hono", "Express"])(
    "keeps an upfront terminal facilitator 4xx as 402 through %s",
    async (adapter) => {
      stubFacilitator("terminal-4xx");

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false, { upfront: true })
          : await driveExpressRequest(false, { upfront: true });
      const headers =
        response instanceof Response ? response.headers : response.headers;

      expect(
        response instanceof Response ? response.status : response.status,
      ).toBe(402);
      expect(
        headers instanceof Headers
          ? headers.get("payment-response")
          : headers["payment-response"],
      ).toBeTruthy();
    },
  );

  it("returns a nonterminal 503 when upfront settlement is unavailable in real Hono", async () => {
    stubFacilitator("unavailable");
    const handlerRuns = { count: 0 };
    const app = new Hono();
    app.use(
      "/quote",
      weftPaymentMiddlewareHono(routes(), config(true)) as never,
    );
    app.get("/quote", (c) => {
      handlerRuns.count += 1;
      return c.json({ ok: true });
    });

    const response = await app.request("https://api.acme.test/quote", {
      headers: { "payment-signature": paymentHeader(true) },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("payment-response")).toBeNull();
    expect(handlerRuns.count).toBe(0);
  });

  it("returns a nonterminal 503 when upfront settlement is unavailable in Express", async () => {
    stubFacilitator("unavailable");
    const handlerRuns = { count: 0 };

    const response = await driveExpressRequest(false, {
      upfront: true,
      handlerRuns,
    });

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.headers["cache-control"]).toContain("private");
    expect(response.headers["payment-response"]).toBeUndefined();
    expect(handlerRuns.count).toBe(0);
  });

  it.each(["Hono", "Express"])(
    "returns a retryable 503 through %s without a terminal receipt",
    async (adapter) => {
      stubFacilitator("unavailable");

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false)
          : await driveExpressRequest(false);
      const status =
        response instanceof Response ? response.status : response.status;
      const headers =
        response instanceof Response ? response.headers : response.headers;
      const get = (name: string) =>
        headers instanceof Headers
          ? headers.get(name)
          : headers[name.toLowerCase()];

      expect(status).toBe(503);
      expect(get("retry-after")).toBeTruthy();
      expect(get("payment-response")).toBeFalsy();
    },
  );

  it.each([
    [false, 402],
    ["unavailable" as const, 503],
  ])(
    "does not leak buffered Express success headers into a %s failure",
    async (settleResult, expectedStatus) => {
      stubFacilitator(settleResult);

      const response = await driveExpressRequest(true, {
        routeHeaders: {
          "Set-Cookie": ["a=1", "b=2"],
          Location: "/success",
          "X-Success-Only": "yes",
        },
      });

      expect(response.status).toBe(expectedStatus);
      expect(
        response.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()],
      ).toBeUndefined();
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
      expect(response.headers["x-success-only"]).toBeUndefined();
    },
  );

  it("clears Express route headers before settlement boundary errors", async () => {
    stubFacilitator("malformed");
    const errors: unknown[] = [];

    const response = await driveExpressRequest(true, {
      errors,
      routeHeaders: {
        "Set-Cookie": ["a=1", "b=2"],
        Location: "/success",
        "X-Success-Only": "yes",
      },
    });

    expect(errors).toHaveLength(1);
    expect(response.headers).toEqual({});
  });

  it.each(["Hono", "Express"])(
    "keeps a structured terminal 4xx as a 402 through %s",
    async (adapter) => {
      stubFacilitator("terminal-4xx");

      const response =
        adapter === "Hono"
          ? await drivePaidRequest(false)
          : await driveExpressRequest(false);

      expect(
        response instanceof Response ? response.status : response.status,
      ).toBe(402);
      const headers =
        response instanceof Response ? response.headers : response.headers;
      expect(
        headers instanceof Headers
          ? headers.get("payment-response")
          : headers["payment-response"],
      ).toBeTruthy();
    },
  );
});
