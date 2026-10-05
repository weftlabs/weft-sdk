import {
  AccountApi,
  BalanceApi,
  Configuration,
  FetchApi,
  PurchasesApi,
  SearchApi,
  type FetchAPI,
  type FetchRequest,
  type FetchResponse,
  type MeResponse,
  type BalanceResponse,
  type PurchaseListResponse,
  type PurchaseResponse,
  type SearchRequest,
  type SearchResponse,
} from "./generated";
import { normalizeWeftError } from "./error";

export interface WeftClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchApi?: FetchAPI;
}

export interface WeftOAuthClientOptions {
  accessToken: string;
  baseUrl?: string;
  fetchApi?: FetchAPI;
}

export type PaidFetchRequest = FetchRequest & { maxCostUsd: string };

export interface FetchOptions {
  idempotencyKey: string;
}

export interface PurchaseListOptions {
  page?: number;
  perPage?: number;
}

function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Stable buyer-facing façade over the generated API clients.
 *
 * The generated clients remain exported for advanced use; this class is the
 * small surface agents and applications should normally build against.
 */
export class WeftClient {
  private readonly account: AccountApi;
  private readonly balances: BalanceApi;
  private readonly searches: SearchApi;
  private readonly fetches: FetchApi;
  private readonly purchaseHistory: PurchasesApi;

  constructor(options: WeftClientOptions | WeftOAuthClientOptions) {
    const apiKey = "apiKey" in options ? options.apiKey : undefined;
    const accessToken =
      "accessToken" in options ? options.accessToken : undefined;
    if (apiKey !== undefined && accessToken !== undefined) {
      throw new Error("apiKey and accessToken are mutually exclusive");
    }
    const credential = (apiKey ?? accessToken)?.trim();
    if (!credential) {
      throw new Error(
        apiKey !== undefined
          ? "apiKey is required"
          : accessToken !== undefined
            ? "accessToken is required"
            : "apiKey or accessToken is required",
      );
    }

    const configuration = new Configuration({
      accessToken: credential,
      basePath: withoutTrailingSlashes(
        options.baseUrl ?? "https://weft.network",
      ),
      fetchApi: options.fetchApi,
    });

    this.account = new AccountApi(configuration);
    this.balances = new BalanceApi(configuration);
    this.searches = new SearchApi(configuration);
    this.fetches = new FetchApi(configuration);
    this.purchaseHistory = new PurchasesApi(configuration);
  }

  private async call<T>(operation: () => Promise<T>, paid = false): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw await normalizeWeftError(error, paid);
    }
  }

  me(): Promise<MeResponse> {
    return this.call(() => this.account.getMe());
  }

  balance(): Promise<BalanceResponse> {
    return this.call(() => this.balances.getBalance());
  }

  search(request: SearchRequest): Promise<SearchResponse> {
    return this.call(() => this.searches.search({ searchRequest: request }));
  }

  fetch(
    request: PaidFetchRequest,
    options: FetchOptions,
  ): Promise<FetchResponse> {
    if (!request.maxCostUsd.trim()) {
      throw new Error("maxCostUsd is required");
    }
    if (!options.idempotencyKey.trim()) {
      throw new Error("idempotencyKey is required");
    }
    // Weft's limit. Checked here so a bad key never looks like a paid failure.
    if (!/^[!-~]{1,255}$/.test(options.idempotencyKey)) {
      throw new Error(
        "idempotencyKey must be 1-255 visible ASCII characters without spaces",
      );
    }

    // Generated FetchRequestBodyToJSON replaces an object body with {}.
    // The server treats JSON.stringify(body) as the same forwarded string.
    const fetchRequest =
      request.body != null && typeof request.body === "object"
        ? { ...request, body: JSON.stringify(request.body) }
        : request;

    return this.call(
      () =>
        this.fetches.fetch({
          fetchRequest,
          idempotencyKey: options.idempotencyKey,
        }),
      true,
    ).then(async (response: FetchResponse | null) => {
      // A 2xx without a fetch result body: the fetch most likely paid.
      if (typeof response?.status !== "number") {
        throw await normalizeWeftError(
          new Error("unreadable fetch response"),
          true,
        );
      }
      return response;
    });
  }

  purchases(options: PurchaseListOptions = {}): Promise<PurchaseListResponse> {
    return this.call(() => this.purchaseHistory.listPurchases(options));
  }

  purchase(id: number): Promise<PurchaseResponse> {
    return this.call(() => this.purchaseHistory.getPurchase({ id }));
  }
}
