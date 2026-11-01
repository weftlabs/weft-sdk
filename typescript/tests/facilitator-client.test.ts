import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createFacilitatorClient,
  validateUrl,
  resolveUrl,
  X402_FACILITATOR_URL,
  X402_FACILITATOR_URL_ENV,
} from "../src/facilitator/client";

const paymentPayload = { x402Version: 2 } as never;
const paymentRequirements = { network: "eip155:84532" } as never;

describe("validateUrl", () => {
  it("accepts https URLs", () => {
    expect(() => validateUrl("https://x402.weft.network")).not.toThrow();
  });

  it("accepts http URLs", () => {
    expect(() => validateUrl("http://localhost:7676")).not.toThrow();
  });

  it("refuses a remote http URL before any request carries the API key", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const headers = {
      supported: { Authorization: "Bearer wk_secret" },
      settle: { "X-API-Key": "wk_secret" },
    };

    expect(() =>
      createFacilitatorClient({ url: "http://x402.example" }, headers),
    ).toThrow("use https://");
    vi.stubEnv(X402_FACILITATOR_URL_ENV, "http://x402.example");
    expect(() => createFacilitatorClient(undefined, headers)).toThrow(
      "use https://",
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects empty string", () => {
    expect(() => validateUrl("")).toThrow("URL cannot be empty");
  });

  it("rejects whitespace-only string", () => {
    expect(() => validateUrl("   ")).toThrow("URL cannot be empty");
  });

  it("rejects URLs without protocol", () => {
    expect(() => validateUrl("x402.weft.network")).toThrow(
      "URL must start with http:// or https://",
    );
  });

  it("rejects ftp protocol", () => {
    expect(() => validateUrl("ftp://x402.weft.network")).toThrow(
      "URL must start with http:// or https://",
    );
  });
});

describe("resolveUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[X402_FACILITATOR_URL_ENV];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns config URL when provided", () => {
    expect(resolveUrl({ url: "https://custom.example.com" })).toBe(
      "https://custom.example.com",
    );
  });

  it("returns env var URL when no config", () => {
    process.env[X402_FACILITATOR_URL_ENV] = "https://env.example.com";
    expect(resolveUrl()).toBe("https://env.example.com");
  });

  it("prefers config URL over env var", () => {
    process.env[X402_FACILITATOR_URL_ENV] = "https://env.example.com";
    expect(resolveUrl({ url: "https://config.example.com" })).toBe(
      "https://config.example.com",
    );
  });

  it("returns default URL when no config and no env", () => {
    expect(resolveUrl()).toBe(X402_FACILITATOR_URL);
  });

  it("returns default URL when config has no url field", () => {
    expect(resolveUrl({})).toBe(X402_FACILITATOR_URL);
  });
});

describe("settlement HTTP status", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves a structured 503 as a retryable boundary error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              errorReason: "temporarily_unavailable",
              transaction: "",
              network: "eip155:84532",
            }),
            { status: 503 },
          ),
      ),
    );

    await expect(
      createFacilitatorClient({ url: "https://facilitator.test" }).settle(
        paymentPayload,
        paymentRequirements,
      ),
    ).rejects.toMatchObject({
      name: "FacilitatorUnavailableError",
      statusCode: 503,
    });
  });

  it("keeps a structured terminal 4xx as Core's SettleError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              errorReason: "insufficient_funds",
              transaction: "",
              network: "eip155:84532",
            }),
            { status: 400 },
          ),
      ),
    );

    await expect(
      createFacilitatorClient({ url: "https://facilitator.test" }).settle(
        paymentPayload,
        paymentRequirements,
      ),
    ).rejects.toMatchObject({ name: "SettleError", statusCode: 400 });
  });

  it("preserves transaction-bearing settlement_pending for Core reconciliation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              errorReason: "settlement_pending",
              transaction: "0xbroadcast",
              network: "eip155:84532",
            }),
            { status: 503 },
          ),
      ),
    );

    await expect(
      createFacilitatorClient({ url: "https://facilitator.test" }).settle(
        paymentPayload,
        paymentRequirements,
      ),
    ).rejects.toMatchObject({
      name: "SettleError",
      statusCode: 503,
      errorReason: "settlement_pending",
      transaction: "0xbroadcast",
    });
  });
});
