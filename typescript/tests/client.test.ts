import { describe, expect, it, vi } from "vitest";
import { WeftClient, type PaidFetchRequest } from "../src/client";
import { WeftError } from "../src/error";
import { FetchErrorResponseErrorEnum } from "../src/generated/models/FetchErrorResponse";
import {
  FetchRequestFromJSON,
  FetchRequestToJSON,
} from "../src/generated/models/FetchRequest";
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
  describe("bounded fetch", () => {
    const legacyRequest = {
      url: "https://merchant.example/data",
      maxCostUsd: "0.050000",
      searchId: "query-trace-1",
      operationId: "operation-1",
      accessMethodId: "access-method-1",
    } satisfies PaidFetchRequest;
    const legacyWire = {
      url: "https://merchant.example/data",
      max_cost_usd: "0.050000",
      search_id: "query-trace-1",
      operation_id: "operation-1",
      access_method_id: "access-method-1",
    };
    const options = Object.freeze({ idempotencyKey: "bounded-purchase-1" });

    it.each(["0", "0.000001", "0.050000"])(
      "round-trips false and exact decimal %s through the generated serializer",
      (maxTotalCostUsd) => {
        const request = {
          ...legacyRequest,
          allowTempoRefill: false,
          maxTotalCostUsd,
        } satisfies PaidFetchRequest;
        const wire = {
          ...legacyWire,
          allow_tempo_refill: false,
          max_total_cost_usd: maxTotalCostUsd,
        };

        expect(JSON.parse(JSON.stringify(FetchRequestToJSON(request)))).toEqual(
          wire,
        );
        expect(FetchRequestFromJSON(wire)).toMatchObject(request);
      },
    );

    it.each([
      { name: "both omitted", controls: {}, wire: {} },
      {
        name: "explicit refill without a total bound",
        controls: { allowTempoRefill: true },
        wire: { allow_tempo_refill: true },
      },
      {
        name: "no refill only",
        controls: { allowTempoRefill: false },
        wire: { allow_tempo_refill: false },
      },
      {
        name: "total bound only, without injecting refill true",
        controls: { maxTotalCostUsd: "0.050000" },
        wire: { max_total_cost_usd: "0.050000" },
      },
    ])("preserves optional controls: $name", async ({ controls, wire }) => {
      // A free response only exercises transport; it is not paid enforcement proof.
      const fetchApi = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({
            status: 200,
            headers: {},
            body_base64: "",
            paid_usd: "0.00",
            held_usd: null,
            payment_status: "free",
          }),
      );
      const client = new WeftClient({ apiKey: "wk_test", fetchApi });

      await client.fetch({ ...legacyRequest, ...controls }, options);

      expect(fetchApi).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetchApi.mock.calls[0][1]?.body))).toEqual({
        ...legacyWire,
        ...wire,
      });
      expect(
        JSON.parse(
          JSON.stringify(
            FetchRequestToJSON(
              FetchRequestFromJSON({
                ...legacyWire,
                ...wire,
              }),
            ),
          ),
        ),
      ).toEqual({ ...legacyWire, ...wire });
    });

    it("preserves the server's rejection of contradictory controls", async () => {
      const fetchApi = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(
            JSON.stringify({
              error: FetchErrorResponseErrorEnum.IncompatibleFetchControls,
            }),
            {
              status: 422,
              headers: { "content-type": "application/json" },
            },
          ),
      );
      const client = new WeftClient({ apiKey: "wk_test", fetchApi });
      const failure = client.fetch(
        {
          ...legacyRequest,
          allowTempoRefill: true,
          maxTotalCostUsd: "0.050000",
        },
        options,
      );

      await expect(failure).rejects.toBeInstanceOf(WeftError);
      await expect(failure).rejects.toMatchObject({
        status: 422,
        code: "INCOMPATIBLE_FETCH_CONTROLS",
        retryable: false,
      });
      expect(fetchApi).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetchApi.mock.calls[0][1]?.body))).toEqual({
        ...legacyWire,
        allow_tempo_refill: true,
        max_total_cost_usd: "0.050000",
      });
    });

    it.each([
      { status: 409, code: "FUNDING_PENDING", reason: "funding_active" },
      { status: 409, code: "FUNDING_PENDING", reason: "balance_changed" },
      { status: 409, code: "IDEMPOTENCY_CONFLICT", reason: "request_changed" },
      {
        status: 402,
        code: "TOTAL_COST_UNVERIFIABLE",
        reason: "binding_cost_unavailable",
      },
      { status: 0, code: "NETWORK_ERROR", reason: "connection reset" },
    ])(
      "preserves $code ($reason) without automatic retry or changed controls",
      async ({ status, code, reason }) => {
        const cause = new TypeError(reason);
        const envelope = {
          error: code,
          details: { reason, retry_after_seconds: 1 },
          policy: {
            max_tx_usd: "1.00",
            daily_limit_usd: "2.00",
            weekly_limit_usd: "5.00",
          },
          balance: {
            promo_usd: "0.00",
            wallet_usdc: null,
            total_usd: null,
            spent_today_usd: "0.00",
            policy_used_today_usd: "0.05",
          },
          dashboard_url: "https://weft.example/dashboard/policy",
        };
        const fetchApi = vi.fn(
          async (_input: RequestInfo | URL, _init?: RequestInit) => {
            if (status === 0) throw cause;
            return new Response(JSON.stringify(envelope), {
              status,
              headers: {
                "content-type": "application/json",
                "x-request-id": "req-bounded-1",
                "retry-after": "1",
              },
            });
          },
        );
        const client = new WeftClient({ apiKey: "wk_test", fetchApi });
        const request = Object.freeze({
          ...legacyRequest,
          allowTempoRefill: false,
          maxTotalCostUsd: "0.050000",
        } satisfies PaidFetchRequest);

        // Only the caller initiates the second attempt, with the same identity.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const failure = client.fetch(request, options);
          await expect(failure).rejects.toBeInstanceOf(WeftError);
          await expect(failure).rejects.toMatchObject({
            status,
            code,
            retryable: status === 0,
            requestId: status === 0 ? undefined : "req-bounded-1",
            details: status === 0 ? cause : envelope,
          });
          expect(fetchApi).toHaveBeenCalledTimes(attempt);
        }

        for (const [url, init] of fetchApi.mock.calls) {
          expect(String(url)).toBe("https://weft.network/api/v1/fetch");
          expect(init?.method).toBe("POST");
          expect(new Headers(init?.headers).get("idempotency-key")).toBe(
            options.idempotencyKey,
          );
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer wk_test",
          );
          expect(JSON.parse(String(init?.body))).toEqual({
            ...legacyWire,
            allow_tempo_refill: false,
            max_total_cost_usd: "0.050000",
          });
        }
        expect(fetchApi.mock.calls[1][1]?.body).toBe(
          fetchApi.mock.calls[0][1]?.body,
        );
      },
    );
  });

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
