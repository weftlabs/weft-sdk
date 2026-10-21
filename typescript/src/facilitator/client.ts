import { HTTPFacilitatorClient, FacilitatorConfig } from "@x402/core/server";
import type {
  PaymentPayload,
  SupportedResponse,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";

export const FACILITATOR_UNAVAILABLE_ERROR =
  "weft:facilitator-settle-unavailable";

export const X402_FACILITATOR_URL = "https://x402.weft.network";
export const X402_FACILITATOR_URL_ENV = "X402_FACILITATOR_URL";

export interface WeftFacilitatorConfig {
  url?: string;
  createAuthHeaders?: FacilitatorConfig["createAuthHeaders"];
}

class FacilitatorUnavailableError extends Error {
  readonly statusCode = 503;

  constructor() {
    super(FACILITATOR_UNAVAILABLE_ERROR);
    this.name = "FacilitatorUnavailableError";
  }
}

function isUnavailableSettleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & Record<string, unknown>;
  return (
    candidate.name === "SettleError" &&
    candidate.statusCode === 503 &&
    "errorReason" in candidate &&
    "errorMessage" in candidate &&
    "payer" in candidate &&
    "transaction" in candidate &&
    "network" in candidate &&
    !(candidate.errorReason === "settlement_pending" && candidate.transaction)
  );
}

/**
 * `/supported` is also the identity handshake: a call with a valid key makes
 * the facilitator record an `sdk_handshake`. A seller that constructs the
 * middleware per request would otherwise handshake per request, so the result
 * is shared per process for each (url, handshake headers) key. A success is
 * reused for `SUPPORTED_TTL_MS`; a failure for `SUPPORTED_FAILURE_FLOOR_MS`,
 * so an outage cannot turn construction rate into facilitator request rate.
 */
const SUPPORTED_TTL_MS = 6 * 60 * 60 * 1000;
const SUPPORTED_FAILURE_FLOOR_MS = 30_000;

interface SharedSupported {
  at: number;
  ttl: number;
  promise: Promise<SupportedResponse>;
}

const sharedSupported = new Map<string, SharedSupported>();

/** Forget every shared `/supported` result. For tests. */
export function resetSharedSupported(): void {
  sharedSupported.clear();
}

class WeftHTTPFacilitatorClient extends HTTPFacilitatorClient {
  constructor(
    config: FacilitatorConfig,
    private readonly shareKey?: string,
  ) {
    super(config);
  }

  override getSupported(): Promise<SupportedResponse> {
    const key = this.shareKey;
    if (key === undefined) return super.getSupported();
    const hit = sharedSupported.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.promise;
    const entry: SharedSupported = {
      at: Date.now(),
      ttl: SUPPORTED_TTL_MS,
      promise: super.getSupported(),
    };
    entry.promise.catch(() => {
      entry.at = Date.now();
      entry.ttl = SUPPORTED_FAILURE_FLOOR_MS;
    });
    sharedSupported.set(key, entry);
    return entry.promise;
  }

  override async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    try {
      return await super.settle(paymentPayload, paymentRequirements);
    } catch (error) {
      if (isUnavailableSettleError(error)) {
        throw new FacilitatorUnavailableError();
      }
      throw error;
    }
  }
}

export function validateUrl(url: string): void {
  if (!url || url.trim() === "") {
    throw new Error("Invalid URL: URL cannot be empty");
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(
      `Invalid URL format: URL must start with http:// or https://, got: ${url}`,
    );
  }
}

export function resolveUrl(config?: WeftFacilitatorConfig): string {
  if (config?.url) {
    return config.url;
  }

  if (
    typeof process !== "undefined" &&
    process.env?.[X402_FACILITATOR_URL_ENV]
  ) {
    return process.env[X402_FACILITATOR_URL_ENV]!;
  }

  return X402_FACILITATOR_URL;
}

type AuthHeadersByPath = Awaited<
  ReturnType<NonNullable<FacilitatorConfig["createAuthHeaders"]>>
>;

/**
 * Reject a flat headers object the way `@x402/core` itself would.
 *
 * Upstream's `HTTPFacilitatorClient` throws when `createAuthHeaders` returns
 * `{ Authorization: ... }` instead of `{ supported: { Authorization: ... } }`,
 * because silently dropping auth on every request is worse than failing loud.
 * Merging the handshake's own `supported` headers in would mask that check —
 * the merged object always has a path key — so the check runs here first,
 * with the same failure mode a misconfigured seller sees today.
 *
 * @param headers - What the seller's `createAuthHeaders` returned
 */
function assertPathKeyedAuthHeaders(headers: AuthHeadersByPath): void {
  const isHeaderObject = (value: unknown): boolean =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const hasPathKey = ["verify", "settle", "supported", "bazaar"].some((key) =>
    isHeaderObject(headers[key as keyof AuthHeadersByPath]),
  );
  const looksFlat =
    !hasPathKey &&
    Object.values(headers).some((value) => !isHeaderObject(value));

  if (looksFlat) {
    throw new Error(
      "createAuthHeaders must return an object keyed by facilitator path, " +
        'e.g. { verify: { Authorization: "..." }, settle: { ... }, ' +
        "supported: { ... } }, but received a flat headers object.",
    );
  }
}

/**
 * Merge SDK-derived headers under a seller's, case-insensitively, seller wins.
 *
 * Header names are case-insensitive, but object keys are not: a plain spread
 * would keep a derived `Authorization` and a seller `authorization` as two
 * keys, and the HTTP layer folds those into one comma-joined value — a
 * garbled credential. So a seller header replaces any derived header of the
 * same name whatever its case, and the seller's spelling is the one sent.
 *
 * @param derived - Headers the SDK derived from config for one path
 * @param seller - The seller's own headers for that path, if any
 * @returns The merged headers, the seller's winning on conflict
 */
function mergeSellerWins(
  derived: Record<string, string>,
  seller: Record<string, string> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...derived };
  for (const [name, value] of Object.entries(seller ?? {})) {
    for (const existing of Object.keys(merged)) {
      if (existing.toLowerCase() === name.toLowerCase()) {
        delete merged[existing];
      }
    }
    merged[name] = value;
  }
  return merged;
}

export function createFacilitatorClient(
  config?: WeftFacilitatorConfig,
  weftAuthHeaders?: AuthHeadersByPath,
): HTTPFacilitatorClient {
  const url = resolveUrl(config);
  validateUrl(url);

  const sellerCreateAuthHeaders = config?.createAuthHeaders;

  // Only the paths the SDK actually derived headers for — `supported` always,
  // `settle` and `verify` when an apiKey was configured. Empty paths are
  // dropped so a caller with no derived headers is byte-identical to passing
  // none.
  const derivedByPath = Object.entries(weftAuthHeaders ?? {}).filter(
    ([, headers]) => headers !== undefined && Object.keys(headers).length > 0,
  ) as Array<[keyof AuthHeadersByPath, Record<string, string>]>;

  const createAuthHeaders =
    derivedByPath.length > 0
      ? async (): Promise<AuthHeadersByPath> => {
          const sellerHeaders = sellerCreateAuthHeaders
            ? await sellerCreateAuthHeaders()
            : undefined;
          if (sellerHeaders) {
            assertPathKeyedAuthHeaders(sellerHeaders);
          }
          // The seller's own headers win on conflict: an explicit
          // createAuthHeaders is a more deliberate act than `apiKey`.
          const merged: AuthHeadersByPath = { ...sellerHeaders };
          for (const [path, derived] of derivedByPath) {
            merged[path] = mergeSellerWins(derived, sellerHeaders?.[path]);
          }
          return merged;
        }
      : sellerCreateAuthHeaders;

  // Only clients built with SDK handshake headers share `/supported`; the
  // key is the identity the handshake would announce.
  const shareKey = weftAuthHeaders
    ? `${url}\n${JSON.stringify(weftAuthHeaders.supported ?? {})}`
    : undefined;

  return new WeftHTTPFacilitatorClient({ url, createAuthHeaders }, shareKey);
}
