import type { OutgoingHttpHeaders } from "node:http";
import {
  HTTPRequestContext,
  PaywallConfig,
  PaywallProvider,
  SETTLEMENT_OVERRIDES_HEADER,
  withPrivateCacheControl,
  x402ResourceServer,
  HTTPAdapter,
} from "@x402/core/server";
import { SchemeNetworkServer, Network } from "@x402/core/types";
import { createFacilitatorClient, WeftFacilitatorConfig } from "../client";
import { buildFacilitatorAuthHeaders } from "./handshake";
import {
  applyProductIdentity,
  WeftProductDeclaration,
  WeftRoutesConfig,
} from "./product";
import { registerDynamicExtensions } from "./extensions";
import {
  paymentResumeCandidate,
  resumePaymentResult,
  type ResumeVerifiedPayment,
} from "./replay";
import {
  WeftHTTPResourceServer,
  isFacilitatorUnavailable,
  isFacilitatorUnavailableResponse,
  isJsonResponse,
} from "./settlement";

interface ExpressRequest {
  method: string;
  path: string;
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  header(name: string): string | string[] | undefined;
}

interface ExpressResponse {
  status(code: number): ExpressResponse;
  setHeader(
    name: string,
    value: string | number | readonly string[],
  ): ExpressResponse;
  /**
   * Headers the route handler has set. Read at settlement time so a
   * `Settlement-Overrides` header reaches the facilitator.
   */
  getHeaders(): OutgoingHttpHeaders;
  removeHeader(name: string): void;
  send(body: unknown): ExpressResponse;
  json(body: unknown): ExpressResponse;
  statusCode: number;
  writeHead: (...args: unknown[]) => ExpressResponse;
  write: (...args: unknown[]) => boolean;
  end: (...args: unknown[]) => ExpressResponse;
  flushHeaders: () => void;
}

type ExpressNextFunction = (err?: unknown) => void;

type BufferedCall =
  | ["writeHead", unknown[]]
  | ["write", unknown[]]
  | ["end", unknown[]]
  | ["flushHeaders", []];

const UNSAFE_FAILURE_HEADERS = new Set([
  SETTLEMENT_OVERRIDES_HEADER.toLowerCase(),
  "location",
  "set-cookie",
]);

function isUnsafeFailureHeader(
  name: string,
  value: string | number | readonly string[] | undefined,
): boolean {
  const normalized = name.toLowerCase();
  return (
    UNSAFE_FAILURE_HEADERS.has(normalized) ||
    (normalized === "cache-control" &&
      value !== undefined &&
      /\bpublic\b/i.test(
        Array.isArray(value) ? value.join(",") : String(value),
      ))
  );
}

/**
 * Floor between background facilitator re-sync attempts.
 *
 * Without it, a sustained facilitator outage on a busy server couples retry
 * (and warn) volume to request rate: a refused connection settles in
 * milliseconds, so every protected request would launch a fresh `/supported`
 * call for the whole outage. One attempt per floor interval bounds both.
 */
const FACILITATOR_SYNC_RETRY_FLOOR_MS = 30_000;

export type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction,
) => Promise<void> | void;

export interface SchemeRegistration {
  network: Network;
  server: SchemeNetworkServer;
}

/**
 * Configuration for the Express payment middleware.
 *
 * Extends {@link WeftProductDeclaration}, so `name`, `type`, `tags`,
 * `iconUrl`, `productId` and `manifestHash` are declared once here and
 * applied to every protected route.
 */
export interface WeftExpressMiddlewareConfig extends WeftProductDeclaration {
  /**
   * The seller's Weft API key.
   *
   * Authenticates the facilitator calls that need it: `X-API-Key` on
   * `/settle` — which the facilitator requires, or every settlement 401s —
   * and `Authorization: Bearer <key>` on the construction-time `/supported`
   * handshake, which is how the dashboard learns an SDK is deployed before
   * any payment. Optional, but a seller who omits it must supply their own
   * `facilitator.createAuthHeaders` or settlement fails.
   */
  apiKey?: string;
  facilitator?: WeftFacilitatorConfig;
  schemes?: SchemeRegistration[];
  paywallConfig?: PaywallConfig;
  paywall?: PaywallProvider;
  syncFacilitatorOnStart?: boolean;
  /** Restore durably bound verified inputs for settlement replay. */
  resumeVerifiedPayment?: ResumeVerifiedPayment;
}

class ExpressAdapter implements HTTPAdapter {
  constructor(private req: ExpressRequest) {}

  getHeader(name: string): string | undefined {
    const value = this.req.header(name);
    return Array.isArray(value) ? value[0] : value;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return this.req.path;
  }

  getUrl(): string {
    const host = this.req.headers.host || "localhost";
    return `${this.req.protocol}://${host}${this.req.path}`;
  }

  getAcceptHeader(): string {
    return this.getHeader("Accept") || "";
  }

  getUserAgent(): string {
    return this.getHeader("User-Agent") || "";
  }

  getQueryParams(): Record<string, string | string[]> {
    return this.req.query as Record<string, string | string[]>;
  }

  getQueryParam(name: string): string | string[] | undefined {
    return this.req.query[name] as string | string[] | undefined;
  }

  getBody(): unknown {
    return this.req.body;
  }
}

/**
 * Flatten Node's outgoing headers into the plain record
 * `HTTPTransportContext` expects. Array values (a repeated header) are joined,
 * numbers stringified; the settlement override lookup in `@x402/core` compares
 * header names case-insensitively.
 *
 * @param headers - Response headers set by the route handler
 * @returns A plain string record
 */
function toHeaderRecord(headers: OutgoingHttpHeaders): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    record[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return record;
}

function responseBodyFromBufferedCalls(
  calls: BufferedCall[],
): Buffer | undefined {
  const chunks: Buffer[] = [];
  for (const [method, args] of calls) {
    if (method !== "write" && method !== "end") continue;
    const chunk = args[0];
    if (chunk === undefined) continue;
    if (typeof chunk === "string") {
      const encoding = typeof args[1] === "string" ? args[1] : "utf8";
      if (!Buffer.isEncoding(encoding)) return undefined;
      chunks.push(Buffer.from(chunk, encoding));
    } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      return undefined;
    }
  }
  return Buffer.concat(chunks);
}

function restoreHeaders(
  res: ExpressResponse,
  headers: OutgoingHttpHeaders,
): void {
  for (const name of Object.keys(res.getHeaders())) res.removeHeader(name);
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) res.setHeader(name, value);
  }
}

async function sendCoreResponse(
  res: ExpressResponse,
  response: {
    status: number;
    headers: Record<string, string | string[]>;
    body?: unknown;
  },
): Promise<void> {
  res.status(response.status);
  Object.entries(response.headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  if (isJsonResponse(response)) {
    res.json(response.body ?? {});
  } else if (response.body instanceof Blob) {
    res.send(Buffer.from(await response.body.arrayBuffer()));
  } else if (response.body instanceof ArrayBuffer) {
    res.send(Buffer.from(response.body));
  } else if (ArrayBuffer.isView(response.body)) {
    res.send(
      Buffer.from(
        response.body.buffer,
        response.body.byteOffset,
        response.body.byteLength,
      ),
    );
  } else {
    res.send(
      typeof response.body === "string"
        ? response.body
        : String(response.body ?? ""),
    );
  }
}

function sendFacilitatorUnavailable(res: ExpressResponse): void {
  res.removeHeader("payment-response");
  res.removeHeader(SETTLEMENT_OVERRIDES_HEADER);
  res.setHeader("retry-after", "1");
  res.setHeader("cache-control", withPrivateCacheControl(null));
  res.status(503).json({ error: "facilitator_unavailable" });
}

/**
 * Create an Express middleware that requires x402 payment for the given routes.
 *
 * Product identity declared on `config` (`name`, `type`, `tags`, `iconUrl`) is
 * merged into every route, so it travels on the 402 challenge's `resource` and
 * from there onto the buyer's payment payload and the settlement event.
 *
 * @param routes - Route configuration, either a path map or a single route;
 *   each route may declare its own `type` to override the product's
 * @param config - Facilitator, scheme, paywall and product identity settings
 * @returns An Express middleware function
 */
export function weftPaymentMiddleware(
  routes: WeftRoutesConfig,
  config?: WeftExpressMiddlewareConfig,
): ExpressMiddleware {
  const facilitatorClient = createFacilitatorClient(
    config?.facilitator,
    buildFacilitatorAuthHeaders("express", config?.apiKey, config ?? {}),
  );
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerDynamicExtensions(resourceServer, routes);

  if (config?.schemes) {
    config.schemes.forEach(({ network, server: schemeServer }) => {
      resourceServer.register(network, schemeServer);
    });
  }

  const httpServer = new WeftHTTPResourceServer(
    resourceServer,
    applyProductIdentity(routes, config ?? {}),
  );

  if (config?.paywall) {
    httpServer.registerPaywallProvider(config.paywall);
  }

  // The construction-time facilitator sync doubles as the identity handshake,
  // so its failure modes are held to handshake rules: it must never crash the
  // process (a rejection with no handler attached would, under Node's default
  // unhandled-rejection policy) and must never brick the middleware. The
  // returned promise therefore cannot reject, and a failed sync is retried in
  // the background off later protected requests until one attempt succeeds.
  const syncOnStart = config?.syncFacilitatorOnStart ?? true;
  let facilitatorSynced = false;
  let syncInFlight: Promise<void> | null = null;
  let lastFailedSyncAt = 0;

  const syncFacilitator = (): Promise<void> => {
    syncInFlight ??= httpServer
      .initialize()
      .then(
        () => {
          facilitatorSynced = true;
        },
        (error: unknown) => {
          lastFailedSyncAt = Date.now();
          console.warn(
            "[weft] facilitator sync failed; payment-protected routes " +
              "degrade until a later attempt succeeds: " +
              (error instanceof Error ? error.message : String(error)),
          );
        },
      )
      .finally(() => {
        syncInFlight = null;
      });
    return syncInFlight;
  };

  let bootSync: Promise<void> | null = syncOnStart ? syncFacilitator() : null;

  return async (
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction,
  ) => {
    const adapter = new ExpressAdapter(req);
    const context: HTTPRequestContext = {
      adapter,
      path: req.path,
      method: req.method,
      paymentHeader:
        adapter.getHeader("payment-signature") ||
        adapter.getHeader("x-payment"),
    };

    if (!httpServer.requiresPayment(context)) {
      return next();
    }

    if (bootSync) {
      // The pre-existing first-request barrier: with a healthy facilitator
      // this resolves once and never runs again. It cannot throw.
      await bootSync;
      bootSync = null;
    }
    if (
      syncOnStart &&
      !facilitatorSynced &&
      Date.now() - lastFailedSyncAt >= FACILITATOR_SYNC_RETRY_FLOOR_MS
    ) {
      // Heal a failed boot sync without delaying anyone: the retry is kicked
      // fire-and-forget (one in flight at most, one attempt per floor
      // interval) and this request proceeds.
      void syncFacilitator();
    }

    let result;
    try {
      const resumeCandidate = paymentResumeCandidate(context);
      const resumedPayment = resumeCandidate
        ? await config?.resumeVerifiedPayment?.(context, resumeCandidate)
        : undefined;
      result = resumedPayment
        ? resumePaymentResult(resourceServer, resumedPayment, context)
        : await httpServer.processHTTPRequest(context, config?.paywallConfig);
    } catch (error) {
      // Express 4 does not catch a rejection from an async middleware; under
      // Node's default policy that takes the whole process down. Routing the
      // failure through next(error) keeps it inside Express's own error
      // handling, whatever left the resource server unable to answer.
      return next(error);
    }

    switch (result.type) {
      case "no-payment-required":
        return next();

      case "payment-error": {
        const { response } = result;
        if (isFacilitatorUnavailableResponse(response)) {
          sendFacilitatorUnavailable(res);
          return;
        }
        await sendCoreResponse(res, response);
        return;
      }

      case "payment-verified": {
        const {
          paymentPayload,
          paymentRequirements,
          declaredExtensions,
          cancellationDispatcher,
          beforeHandlerSettlement,
        } = result;

        const originalWriteHead = res.writeHead.bind(res);
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const originalFlushHeaders = res.flushHeaders.bind(res);
        const originalSetHeader = res.setHeader.bind(res);
        const originalRemoveHeader = res.removeHeader.bind(res);
        const headersBeforeHandler = { ...res.getHeaders() };

        let bufferedCalls: BufferedCall[] = [];
        let settled = false;
        const failureHeaders = new Map<
          string,
          {
            name: string;
            value?: string | number | readonly string[];
          }
        >();

        const restoreResponseMethods = () => {
          res.setHeader = originalSetHeader;
          res.removeHeader = originalRemoveHeader;
          res.writeHead = originalWriteHead;
          res.write = originalWrite;
          res.end = originalEnd;
          res.flushHeaders = originalFlushHeaders;
        };

        const replayBufferedCall = ([method, args]: BufferedCall) => {
          if (method === "writeHead") {
            const [statusCode, statusMessage] = args;
            return typeof statusMessage === "string"
              ? originalWriteHead(statusCode, statusMessage)
              : originalWriteHead(statusCode);
          }
          if (method === "write") return originalWrite(...args);
          if (method === "end") return originalEnd(...args);
          return originalFlushHeaders();
        };

        let endCalled: () => void;
        const endPromise = new Promise<void>((resolve) => {
          endCalled = resolve;
        });

        res.writeHead = function (...args: unknown[]) {
          if (!settled) {
            const [statusCode, statusMessageOrHeaders, maybeHeaders] = args;
            if (typeof statusCode === "number") {
              res.statusCode = statusCode;
            }
            const headers =
              typeof statusMessageOrHeaders === "string"
                ? maybeHeaders
                : statusMessageOrHeaders;
            if (Array.isArray(headers)) {
              const grouped = new Map<
                string,
                { name: string; values: string[] }
              >();
              for (let index = 0; index < headers.length; index += 2) {
                const name = String(headers[index]);
                const key = name.toLowerCase();
                const entry = grouped.get(key) ?? { name, values: [] };
                entry.values.push(String(headers[index + 1]));
                grouped.set(key, entry);
              }
              for (const { name, values } of grouped.values()) {
                res.setHeader(name, values.length === 1 ? values[0] : values);
              }
            } else if (headers && typeof headers === "object") {
              for (const [key, value] of Object.entries(headers)) {
                if (value === undefined) continue;
                res.setHeader(
                  key,
                  Array.isArray(value) ? value : String(value),
                );
              }
            }
            bufferedCalls.push(["writeHead", args]);
            return res;
          }
          return originalWriteHead(...args);
        } as typeof res.writeHead;

        res.setHeader = function (name, value) {
          const result = originalSetHeader(name, value);
          if (!settled && res.statusCode >= 400) {
            failureHeaders.set(name.toLowerCase(), {
              name,
              value: Array.isArray(value) ? [...value] : value,
            });
          }
          return result;
        } as typeof res.setHeader;

        res.removeHeader = function (name) {
          originalRemoveHeader(name);
          if (!settled && res.statusCode >= 400) {
            failureHeaders.set(name.toLowerCase(), { name });
          }
        };

        res.write = function (...args: unknown[]) {
          if (!settled) {
            bufferedCalls.push(["write", args]);
            return true;
          }
          return originalWrite(...args);
        } as typeof res.write;

        res.end = function (...args: unknown[]) {
          if (!settled) {
            bufferedCalls.push(["end", args]);
            endCalled();
            return res;
          }
          return originalEnd(...args);
        } as typeof res.end;

        res.flushHeaders = function () {
          if (!settled) {
            bufferedCalls.push(["flushHeaders", []]);
            return;
          }
          return originalFlushHeaders();
        };

        const finalizeFailure = async (
          cancellation:
            | { reason: "handler_threw"; error: unknown }
            | { reason: "handler_failed"; responseStatus: number },
        ) => {
          // Express exposes only the final header bag, not whether a pre-status
          // header belongs to a direct error response or a later throw. Preserve
          // by default and remove only headers that can leak payment or success.
          const preservedFailureHeaders = new Map<
            string,
            string | number | readonly string[]
          >();
          for (const [name, value] of Object.entries(res.getHeaders())) {
            if (value === undefined || isUnsafeFailureHeader(name, value))
              continue;
            preservedFailureHeaders.set(
              name,
              Array.isArray(value) ? [...value] : value,
            );
          }
          const cancelSettlement =
            await cancellationDispatcher.cancel(cancellation);
          settled = true;
          restoreHeaders(res, headersBeforeHandler);
          for (const [name, value] of Object.entries(res.getHeaders())) {
            if (isUnsafeFailureHeader(name, value)) res.removeHeader(name);
          }
          for (const [name, value] of preservedFailureHeaders) {
            res.setHeader(name, value);
          }
          for (const { name, value } of failureHeaders.values()) {
            if (value === undefined || isUnsafeFailureHeader(name, value))
              res.removeHeader(name);
            else res.setHeader(name, value);
          }
          const existingCacheControl = Object.entries(res.getHeaders()).find(
            ([key]) => key.toLowerCase() === "cache-control",
          )?.[1];
          const headers = httpServer.createFailurePathSettlementHeaders(
            cancelSettlement,
            beforeHandlerSettlement,
            paymentPayload,
            Array.isArray(existingCacheControl)
              ? existingCacheControl.join(",")
              : existingCacheControl === undefined
                ? undefined
                : String(existingCacheControl),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
          restoreResponseMethods();

          for (const call of bufferedCalls) replayBufferedCall(call);
          bufferedCalls = [];
        };

        try {
          next();
        } catch (error) {
          bufferedCalls = [];
          restoreHeaders(res, headersBeforeHandler);
          failureHeaders.clear();
          try {
            next(error);
          } catch (errorMiddlewareError) {
            restoreResponseMethods();
            throw errorMiddlewareError;
          }
          await endPromise;
          await finalizeFailure({ reason: "handler_threw", error });
          return;
        }

        await endPromise;

        if (res.statusCode >= 400) {
          await finalizeFailure({
            reason: "handler_failed",
            responseStatus: res.statusCode,
          });
          return;
        }

        try {
          const settleResult = await httpServer.processSettlement(
            paymentPayload,
            paymentRequirements,
            declaredExtensions,
            // The route handler signals a settlement override (a metered amount
            // below the signed maximum) through a response header.
            // `processSettlement` only reads that off `transportContext`, so
            // omitting this settles the full authorised amount and makes
            // `upto` behave exactly like `exact`.
            {
              request: context,
              responseBody: responseBodyFromBufferedCalls(bufferedCalls),
              responseHeaders: toHeaderRecord(res.getHeaders()),
            },
            undefined,
            beforeHandlerSettlement,
          );

          if (!settleResult.success) {
            bufferedCalls = [];
            restoreHeaders(res, headersBeforeHandler);
            if (isFacilitatorUnavailable(settleResult.errorReason)) {
              sendFacilitatorUnavailable(res);
              return;
            }
            const { response } = settleResult;
            await sendCoreResponse(res, response);
            return;
          }

          Object.entries(settleResult.headers).forEach(([key, value]) => {
            const headerValue = Array.isArray(value)
              ? value.join(",")
              : String(value);
            res.setHeader(key, headerValue);
          });
          const cacheControl = res.getHeaders()["cache-control"];
          res.setHeader(
            "cache-control",
            withPrivateCacheControl(
              Array.isArray(cacheControl)
                ? cacheControl.join(",")
                : cacheControl === undefined
                  ? null
                  : String(cacheControl),
            ),
          );
          res.removeHeader(SETTLEMENT_OVERRIDES_HEADER);
        } catch (error) {
          bufferedCalls = [];
          restoreHeaders(res, headersBeforeHandler);
          settled = true;
          restoreResponseMethods();
          next(error);
          return;
        } finally {
          settled = true;
          restoreResponseMethods();

          for (const call of bufferedCalls) replayBufferedCall(call);
          bufferedCalls = [];
        }
        return;
      }
    }
  };
}
