import { FetchError, ResponseError } from "./generated";

/**
 * Whether the failed call can have created a charge. `none` covers this call
 * only: an earlier call under the same idempotency key can still have paid.
 * After `possible`, retry only with the same idempotency key and request.
 */
export type WeftCharge = "none" | "possible";

// Codes Weft raises before it signs a payment in that call. Owner: the
// weft-app raise sites listed in the conformance README.
const PRE_SIGN_FETCH_CODES = new Set([
  "EXCEEDED_MAX_COST",
  "MERCHANT_RETURNED_NON_402",
  "INSUFFICIENT_BALANCE",
  "DENYLISTED_RECIPIENT",
  "WALLET_ENVIRONMENT_MISMATCH",
  "UNSUPPORTED_ASSET",
  "INVALID_REQUEST",
  "UNKNOWN_PARAMETER",
  "INVALID_URL",
  "INVALID_MAX_COST_USD",
  "UNSUPPORTED_METHOD",
  "INVALID_BODY",
  "INVALID_HEADERS",
  "INVALID_IDEMPOTENCY_KEY",
]);

export function fetchCharge(status: number, code: string): WeftCharge {
  const preSign =
    PRE_SIGN_FETCH_CODES.has(code) || code.startsWith("POLICY_VIOLATION_");
  return status >= 400 && status < 500 && preSign ? "none" : "possible";
}

export interface WeftErrorOptions {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  retryable: boolean;
  details?: unknown;
  charge?: WeftCharge;
}

export class WeftError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly charge: WeftCharge;

  constructor(options: WeftErrorOptions) {
    super(options.message);
    this.name = "WeftError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryable = options.retryable;
    this.details = options.details;
    this.charge = options.charge ?? "none";
  }
}

export async function normalizeWeftError(
  error: unknown,
  paid = false,
): Promise<unknown> {
  if (error instanceof FetchError) {
    // No HTTP response exists, so the outcome is uncertain. Callers retry
    // with backoff and, for paid fetch, reuse the same idempotency key.
    return new WeftError({
      status: 0,
      code: "NETWORK_ERROR",
      message: `Network failure before a Weft API response: ${
        error.cause?.message ?? error.message
      }`,
      retryable: true,
      details: error.cause,
      charge: paid ? "possible" : "none",
    });
  }
  if (!(error instanceof ResponseError)) return error;

  let details: unknown;
  try {
    details = await error.response.json();
  } catch {
    details = undefined;
  }
  const body = details as
    | {
        error?:
          { code?: string; message?: string; request_id?: string } | string;
        code?: string;
        message?: string;
        request_id?: string;
      }
    | undefined;
  const nested = typeof body?.error === "object" ? body.error : undefined;
  const status = error.response.status;
  const code =
    nested?.code ??
    body?.code ??
    (typeof body?.error === "string" ? body.error : `HTTP_${status}`);

  return new WeftError({
    status,
    code,
    message:
      nested?.message ?? body?.message ?? `Weft API returned HTTP ${status}`,
    requestId:
      nested?.request_id ??
      body?.request_id ??
      error.response.headers.get("x-request-id") ??
      undefined,
    retryable: status === 429 || status >= 500,
    details,
    charge: paid ? fetchCharge(status, String(code)) : "none",
  });
}
