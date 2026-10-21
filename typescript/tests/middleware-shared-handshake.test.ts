import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { weftPaymentMiddleware } from "../src/facilitator/middleware/express";
import { getFeeInfo, invalidateFeeCache } from "../src/facilitator/fee";
import type { Network, SchemeNetworkServer } from "@x402/core/types";

/**
 * A seller that builds the middleware per request must not handshake per
 * request: `/supported` with a key is the facilitator's `sdk_handshake`.
 */

const NETWORK: Network = "eip155:84532";
const URL_ = "http://facilitator.test";
const fakeScheme = {
  scheme: "exact",
  defaultAssetTransferMethod: "authorization",
  paymentFlows: {
    authorization: { supported: ["authorization"], default: "authorization" },
  },
  async parsePrice() {
    return { amount: "10000", asset: "0x1" };
  },
  async enhancePaymentRequirements(r: unknown) {
    return r;
  },
} as unknown as SchemeNetworkServer;
const routes = {
  "GET /v1/search": {
    accepts: {
      scheme: "exact",
      network: NETWORK,
      payTo: "0x1",
      price: "$0.01",
    },
  },
};
const BODY = JSON.stringify({
  kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
  extensions: [],
  signers: {},
  fee: { amount: "1", asset: "0x1", network: NETWORK },
});

let calls: Array<Record<string, string>>;

function stubFetch(status = 200): void {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(init?.headers ?? {})) {
        headers[k.toLowerCase()] = String(v);
      }
      calls.push(headers);
      return new Response(status === 200 ? BODY : "down", { status });
    }),
  );
}

/** Construct, then send one unpaid request so the boot sync is awaited. */
async function constructAndDrive(apiKey = "wk_live_a"): Promise<void> {
  const mw = weftPaymentMiddleware(routes, {
    apiKey,
    facilitator: { url: URL_ },
    schemes: [{ network: NETWORK, server: fakeScheme }],
  });
  const headers = { host: "api.test" } as Record<string, string>;
  const res: Record<string, unknown> = {
    status: () => res,
    setHeader: () => res,
    send: () => res,
    json: () => res,
    writeHead: () => res,
    write: () => true,
    end: () => res,
    getHeaders: () => ({}),
    flushHeaders: () => undefined,
  };
  await mw(
    {
      method: "GET",
      path: "/v1/search",
      protocol: "https",
      headers,
      query: {},
      header: (n: string) => headers[n.toLowerCase()],
    },
    res as never,
    vi.fn(),
  );
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  invalidateFeeCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shared /supported handshake", () => {
  it("makes one call for many constructions", async () => {
    stubFetch();
    for (let i = 0; i < 5; i++) await constructAndDrive();
    expect(calls).toHaveLength(1);
  });

  it("makes a separate call for a different API key", async () => {
    stubFetch();
    await constructAndDrive("wk_live_a");
    await constructAndDrive("wk_live_b");
    expect(calls).toHaveLength(2);
  });

  it("holds a failed sync to the 30 s floor across constructions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    stubFetch(503);
    await constructAndDrive();
    await constructAndDrive();
    expect(calls).toHaveLength(1);
    vi.setSystemTime(Date.now() + 31_000);
    await constructAndDrive();
    expect(calls).toHaveLength(2);
  });

  it("warns once when constructed more than 10 times", async () => {
    stubFetch();
    for (let i = 0; i < 15; i++) await constructAndDrive();
    const warns = vi
      .mocked(console.warn)
      .mock.calls.filter((c) => String(c[0]).includes("constructed more than"));
    expect(warns).toHaveLength(1);
  });
});

describe("fee refresh is not a handshake", () => {
  it("sends no seller credentials to /supported", async () => {
    stubFetch();
    // The upstream client's schema drops `fee`, so this rejects; only the
    // request it sent matters here.
    await getFeeInfo({
      url: URL_,
      createAuthHeaders: async () => ({
        supported: {
          Authorization: "Bearer wk_live_a",
          "X-Weft-Declared": "abc",
        },
      }),
    }).catch(() => undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0].authorization).toBeUndefined();
    expect(calls[0]["x-weft-declared"]).toBeUndefined();
  });
});
