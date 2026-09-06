import { x402HTTPResourceServer } from "@x402/core/server";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { FACILITATOR_UNAVAILABLE_ERROR } from "../client";

const CORE_FACILITATOR_UNAVAILABLE =
  /^Facilitator settle failed \(503\):(?: |$)/;

/**
 * The Weft client marks structured 503s before Core drops their status. Match
 * Core's exact prefix only as a fallback for unstructured 503 responses.
 */
export function isFacilitatorUnavailable(errorReason?: string): boolean {
  return (
    errorReason === FACILITATOR_UNAVAILABLE_ERROR ||
    CORE_FACILITATOR_UNAVAILABLE.test(errorReason ?? "")
  );
}

interface CoreResponseInstructions {
  body?: unknown;
  headers: Record<string, string | string[]>;
}

function responseHeader(
  headers: CoreResponseInstructions["headers"],
  name: string,
): string | undefined {
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  )?.[1];
  return Array.isArray(value) ? value[0] : value;
}

export function isFacilitatorUnavailableResponse(
  response: CoreResponseInstructions,
): boolean {
  if (typeof response.body === "object" && response.body !== null) {
    for (const field of ["errorReason", "error"]) {
      if (
        field in response.body &&
        typeof response.body[field as keyof typeof response.body] ===
          "string" &&
        isFacilitatorUnavailable(
          response.body[field as keyof typeof response.body] as string,
        )
      ) {
        return true;
      }
    }
  }

  const paymentResponse = responseHeader(response.headers, "payment-response");
  if (!paymentResponse) return false;
  try {
    return isFacilitatorUnavailable(
      decodePaymentResponseHeader(paymentResponse).errorReason,
    );
  } catch {
    return false;
  }
}

export function isJsonResponse(response: CoreResponseInstructions): boolean {
  const contentType = responseHeader(response.headers, "content-type");
  return /^(application\/json|[^;]+\+json)(?:;|$)/i.test(contentType ?? "");
}

export function serializeResponseBody(
  response: CoreResponseInstructions,
): BodyInit {
  if (isJsonResponse(response)) return JSON.stringify(response.body ?? {});
  if (
    response.body instanceof Blob ||
    response.body instanceof ArrayBuffer ||
    ArrayBuffer.isView(response.body)
  ) {
    return response.body as BodyInit;
  }
  return typeof response.body === "string"
    ? response.body
    : String(response.body ?? "");
}

/** Observe the seller method at both before-handler and after-handler settlement. */
export class WeftHTTPResourceServer extends x402HTTPResourceServer {
  override processSettlement(
    ...args: Parameters<x402HTTPResourceServer["processSettlement"]>
  ) {
    const request = args[3]?.request;
    const method = request?.method ?? request?.adapter.getMethod();
    if (method) {
      const payload = { ...args[0], httpMethod: method.toUpperCase() };
      args[0] = payload;
    }
    return super.processSettlement(...args);
  }
}
