import { describe, expect, it, vi } from "vitest";
import { WeftClient } from "../src/client";
import {
  FetchResponsePaymentStatusEnum,
  FetchResponseToJSON,
} from "../src/generated/models/FetchResponse";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("WeftClient", () => {
  it("routes buyer operations through the generated APIs", async () => {
    const fetchApi = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/v1/me") {
          return jsonResponse({
            data: { principal_type: "user", id: 1, email: "agent@example.com" },
          });
        }
        if (path === "/api/v1/balance") {
          return jsonResponse({
            wallet: { address: "0xabc", balance_usdc: "2.00" },
            policy: {
              max_tx_usd: "1.00",
              daily_limit_usd: "2.00",
              weekly_limit_usd: "5.00",
            },
            spend: { daily_usd: "0.00", weekly_usd: "0.00" },
            promo: { balance_usdc: "0.00", spent_usdc: "0.00" },
          });
        }
        if (path === "/api/v1/search")
          return jsonResponse({ results: [], warnings: [] });
        if (path === "/api/v1/fetch") {
          return jsonResponse({
            status: 200,
            headers: {},
            body_base64: "",
            paid_usd: "0",
            held_usd: "0",
            payment_status: "free",
          });
        }
        if (path === "/api/v1/purchases/7")
          return jsonResponse({ data: { id: 7 } });
        return jsonResponse({
          data: [],
          pagination: {
            current_page: 1,
            per_page: 25,
            total_pages: 0,
            total_count: 0,
          },
        });
      },
    );
    const client = new WeftClient({
      apiKey: "wk_test",
      baseUrl: "https://staging.example/",
      fetchApi,
    });

    await client.me();
    await client.balance();
    await client.search({ query: "weather" });
    await client.fetch(
      { url: "https://merchant.example/data", maxCostUsd: "0.10" },
      { idempotencyKey: "retry-1" },
    );
    await client.purchases();
    await client.purchase(7);

    expect(fetchApi).toHaveBeenCalledTimes(6);
    for (const [, init] of fetchApi.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer wk_test",
      );
    }
    const [fetchUrl, fetchInit] = fetchApi.mock.calls[3];
    expect(String(fetchUrl)).toBe("https://staging.example/api/v1/fetch");
    expect(new Headers(fetchInit?.headers).get("idempotency-key")).toBe(
      "retry-1",
    );
    expect(JSON.parse(String(fetchInit?.body))).toMatchObject({
      url: "https://merchant.example/data",
      max_cost_usd: "0.10",
    });
  });

  it.each([42, null])(
    "retrieves SIWX results with a zero ceiling and artifact %s",
    async (artifactId) => {
      const fetchApi = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({
            status: 200,
            headers: { "content-type": "application/json" },
            body_base64: "e30=",
            paid_usd: "0.00",
            held_usd: null,
            payment_status: "not_required",
            tx_hash: null,
            protocol: "x402",
            artifact_id: artifactId,
          }),
      );
      const client = new WeftClient({ apiKey: "wk_test", fetchApi });
      const result = await client.fetch(
        {
          url: "https://merchant.example/runs/1",
          method: "GET",
          maxCostUsd: "0",
        },
        { idempotencyKey: "poll-1" },
      );
      expect(
        JSON.parse(String(fetchApi.mock.calls[0]?.[1]?.body)),
      ).toMatchObject({
        method: "GET",
        max_cost_usd: "0",
        url: "https://merchant.example/runs/1",
      });
      expect(result).toMatchObject({
        paymentStatus: FetchResponsePaymentStatusEnum.NotRequired,
        paidUsd: "0.00",
        heldUsd: null,
        txHash: null,
        artifactId,
        bodyBase64: "e30=",
      });
      expect(FetchResponseToJSON(result)).toMatchObject({
        held_usd: null,
        tx_hash: null,
        artifact_id: artifactId,
      });
    },
  );

  it("requires an API key and a max cost", async () => {
    expect(() => new WeftClient({ apiKey: " " })).toThrow("apiKey is required");
    const client = new WeftClient({ apiKey: "wk_test", fetchApi: vi.fn() });
    expect(() =>
      client.fetch({ url: "https://merchant.example", maxCostUsd: "" }),
    ).toThrow("maxCostUsd is required");
  });

  it("accepts an OAuth access token as bearer authentication", async () => {
    const fetchApi = vi.fn(async () =>
      jsonResponse({
        data: { principal_type: "user", id: 1, email: "agent@example.com" },
      }),
    );
    const client = new WeftClient({
      accessToken: "oauth_test",
      fetchApi,
    });

    await client.me();

    expect(
      new Headers(fetchApi.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe("Bearer oauth_test");
  });

  it("requires exactly one credential", () => {
    expect(() => new WeftClient({} as never)).toThrow(
      "apiKey or accessToken is required",
    );
    expect(
      () =>
        new WeftClient({
          apiKey: "wk_test",
          accessToken: "oauth_test",
        } as never),
    ).toThrow("apiKey and accessToken are mutually exclusive");
  });

  it("removes long trailing-slash runs from caller-provided base URLs", async () => {
    const fetchApi = vi.fn(async () =>
      jsonResponse({
        data: { principal_type: "user", id: 1, email: "agent@example.com" },
      }),
    );
    const client = new WeftClient({
      apiKey: "wk_test",
      baseUrl: `https://staging.example${"/".repeat(10_000)}`,
      fetchApi,
    });

    await client.me();

    expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
      "https://staging.example/api/v1/me",
    );
  });
});
