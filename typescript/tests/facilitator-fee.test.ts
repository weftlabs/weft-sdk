import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invalidateFeeCache, getFeeInfo } from "../src/facilitator/fee";

// Real facilitator client; only the HTTP layer is stubbed.
const mockFetch = vi.fn();
const mockGetSupported = mockFetch;

function stubSupported(body: unknown) {
  mockFetch.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

describe("getFeeInfo", () => {
  beforeEach(() => {
    invalidateFeeCache();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads fee from a real-shaped /supported response (kinds, extensions, signers)", async () => {
    stubSupported({
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
      extensions: [],
      signers: {},
      fee: { amount: "0.001", asset: "USDC", network: "base" },
    });

    await expect(
      getFeeInfo({ url: "https://facilitator.test" }),
    ).resolves.toEqual({ amount: "0.001", asset: "USDC", network: "base" });
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://facilitator.test/supported",
    );
  });

  it("throws on a non-2xx /supported", async () => {
    mockFetch.mockResolvedValue(new Response("down", { status: 502 }));

    await expect(getFeeInfo()).rejects.toThrow("/supported failed (502)");
  });

  it("fetches fee info from /supported", async () => {
    stubSupported({
      fee: { amount: "0.001", asset: "USDC", network: "base-sepolia" },
    });

    const fee = await getFeeInfo();

    expect(fee).toEqual({
      amount: "0.001",
      asset: "USDC",
      network: "base-sepolia",
    });
    expect(mockGetSupported).toHaveBeenCalledOnce();
  });

  it("caches fee info on subsequent calls", async () => {
    stubSupported({
      fee: { amount: "0.001", asset: "USDC", network: "base-sepolia" },
    });

    const first = await getFeeInfo();
    const second = await getFeeInfo();

    expect(first).toEqual(second);
    expect(mockGetSupported).toHaveBeenCalledOnce();
  });

  it("refetches after cache invalidation", async () => {
    stubSupported({
      fee: { amount: "0.001", asset: "USDC", network: "base-sepolia" },
    });

    await getFeeInfo();
    invalidateFeeCache();
    await getFeeInfo();

    expect(mockGetSupported).toHaveBeenCalledTimes(2);
  });

  it("throws when fee not found in response", async () => {
    stubSupported({});

    await expect(getFeeInfo()).rejects.toThrow(
      "Fee information not found in /supported response",
    );
  });

  it("throws when fee amount is not a string", async () => {
    stubSupported({
      fee: { amount: 0.001, asset: "USDC", network: "base-sepolia" },
    });

    await expect(getFeeInfo()).rejects.toThrow("amount must be a string");
  });

  it("throws when fee asset is not a string", async () => {
    stubSupported({
      fee: { amount: "0.001", asset: 123, network: "base-sepolia" },
    });

    await expect(getFeeInfo()).rejects.toThrow("asset must be a string");
  });

  it("throws when fee network is not a string", async () => {
    stubSupported({
      fee: { amount: "0.001", asset: "USDC", network: null },
    });

    await expect(getFeeInfo()).rejects.toThrow("network must be a string");
  });

  it("respects custom TTL", async () => {
    stubSupported({
      fee: { amount: "0.001", asset: "USDC", network: "base-sepolia" },
    });

    // Use a very short TTL
    await getFeeInfo(undefined, { ttl: 1 });

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    await getFeeInfo(undefined, { ttl: 1 });

    expect(mockGetSupported).toHaveBeenCalledTimes(2);
  });
});
