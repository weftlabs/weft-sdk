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
  serializeResponseBody,
} from "./settlement";

interface HonoRequest {
  method: string;
  path: string;
  url: string;
  header(name: string): string | undefined;
  query(): Record<string, string>;
  query(name: string): string | undefined;
  json(): Promise<unknown>;
}

interface HonoContext {
  req: HonoRequest;
  res: Response | undefined;
  error?: Error;
  header(
    name: string,
    value: string | undefined,
    options?: { append?: boolean },
  ): void;
  html(body: string, status?: number): Response;
  json(body: unknown, status?: number): Response;
}

export type HonoMiddleware = (
  c: HonoContext,
  next: () => Promise<void>,
) => Promise<Response | void>;

/**
 * Floor between background facilitator re-sync attempts.
 *
 * Without it, a sustained facilitator outage on a busy server couples retry
 * (and warn) volume to request rate: a refused connection settles in
 * milliseconds, so every protected request would launch a fresh `/supported`
 * call for the whole outage. One attempt per floor interval bounds both.
 */
const FACILITATOR_SYNC_RETRY_FLOOR_MS = 30_000;

export interface SchemeRegistration {
  network: Network;
  server: SchemeNetworkServer;
}

/**
 * Configuration for the Hono payment middleware.
 *
 * Extends {@link WeftProductDeclaration}, so `name`, `type`, `tags`,
 * `iconUrl`, `productId` and `manifestHash` are declared once here and
 * applied to every protected route.
 */
export interface WeftHonoMiddlewareConfig extends WeftProductDeclaration {
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

class HonoAdapter implements HTTPAdapter {
  constructor(private c: HonoContext) {}

  getHeader(name: string): string | undefined {
    return this.c.req.header(name);
  }

  getMethod(): string {
    return this.c.req.method;
  }

  getPath(): string {
    return this.c.req.path;
  }

  getUrl(): string {
    return this.c.req.url;
  }

  getAcceptHeader(): string {
    return this.c.req.header("Accept") || "";
  }

  getUserAgent(): string {
    return this.c.req.header("User-Agent") || "";
  }

  getQueryParams(): Record<string, string | string[]> {
    const query = this.c.req.query();
    const result: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(query)) {
      result[key] = value;
    }
    return result;
  }

  getQueryParam(name: string): string | string[] | undefined {
    return this.c.req.query(name);
  }

  async getBody(): Promise<unknown> {
    try {
      return await this.c.req.json();
    } catch {
      return undefined;
    }
  }
}

/**
 * Flatten a `Headers` instance into the plain record `HTTPTransportContext`
 * expects. Header names are already lowercased by `Headers`; the settlement
 * override lookup in `@x402/core` compares case-insensitively either way.
 *
 * @param headers - Response headers set by the route handler, if any
 * @returns A plain record, or undefined when there is no response yet
 */
function toHeaderRecord(
  headers: Headers | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * Rebuild a Fetch response with additional headers. Responses returned by
 * `fetch()` and `Response.redirect()` have immutable header guards.
 *
 * @param response - The route handler response
 * @param additions - Headers to add to the outgoing response
 * @returns The original response when there are no additions, otherwise a rebuilt response
 */
function withResponseHeaders(
  response: Response,
  additions: Record<string, string> | undefined,
): Response {
  if (
    (!additions || Object.keys(additions).length === 0) &&
    !response.headers.has(SETTLEMENT_OVERRIDES_HEADER)
  )
    return response;
  const headers = new Headers(response.headers);
  Object.entries(additions ?? {}).forEach(([key, value]) => {
    headers.set(key, value);
  });
  headers.delete(SETTLEMENT_OVERRIDES_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSuccessfulSettlementHeaders(
  response: Response,
  additions: Record<string, string>,
): Response {
  const headers = new Headers(response.headers);
  Object.entries(additions).forEach(([key, value]) => {
    headers.set(key, value);
  });
  headers.delete(SETTLEMENT_OVERRIDES_HEADER);
  headers.set(
    "cache-control",
    withPrivateCacheControl(headers.get("cache-control")),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function failureResponse(
  body: unknown,
  status: number,
  headers: Record<string, string | string[]>,
): Response {
  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) responseHeaders.append(name, item);
  }
  return new Response(serializeResponseBody({ body, headers }), {
    status,
    headers: responseHeaders,
  });
}

function facilitatorUnavailableResponse(): Response {
  return failureResponse({ error: "facilitator_unavailable" }, 503, {
    "retry-after": "1",
    "cache-control": withPrivateCacheControl(null),
    "content-type": "application/json; charset=UTF-8",
  });
}

function replaceContextResponse(c: HonoContext, response: Response): void {
  for (const name of [...(c.res?.headers.keys() ?? [])]) {
    c.header(name, undefined);
  }
  c.res = response;
}

/**
 * Create a Hono middleware that requires x402 payment for the given routes.
 *
 * Product identity declared on `config` (`name`, `type`, `tags`, `iconUrl`) is
 * merged into every route, so it travels on the 402 challenge's `resource` and
 * from there onto the buyer's payment payload and the settlement event.
 *
 * @param routes - Route configuration, either a path map or a single route;
 *   each route may declare its own `type` to override the product's
 * @param config - Facilitator, scheme, paywall and product identity settings
 * @returns A Hono middleware function
 */
export function weftPaymentMiddlewareHono(
  routes: WeftRoutesConfig,
  config?: WeftHonoMiddlewareConfig,
): HonoMiddleware {
  const facilitatorClient = createFacilitatorClient(
    config?.facilitator,
    buildFacilitatorAuthHeaders("hono", config?.apiKey, config ?? {}),
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
  // A request the sync still cannot serve rejects into Hono's own onError.
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

  return async (c: HonoContext, next: () => Promise<void>) => {
    const adapter = new HonoAdapter(c);
    const context: HTTPRequestContext = {
      adapter,
      path: c.req.path,
      method: c.req.method,
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

    const resumeCandidate = paymentResumeCandidate(context);
    const resumedPayment = resumeCandidate
      ? await config?.resumeVerifiedPayment?.(context, resumeCandidate)
      : undefined;
    const result = resumedPayment
      ? resumePaymentResult(resourceServer, resumedPayment, context)
      : await httpServer.processHTTPRequest(context, config?.paywallConfig);

    switch (result.type) {
      case "no-payment-required":
        return next();

      case "payment-error": {
        const { response } = result;
        if (isFacilitatorUnavailableResponse(response)) {
          return facilitatorUnavailableResponse();
        }
        if (!response.isHtml && !isJsonResponse(response)) {
          return failureResponse(
            response.body,
            response.status,
            response.headers,
          );
        }
        Object.entries(response.headers).forEach(([key, value]) => {
          c.header(key, value as string);
        });
        if (response.isHtml) {
          return c.html(response.body as string, response.status as 402);
        }
        return c.json(response.body || {}, response.status as 402);
      }

      case "payment-verified": {
        const {
          paymentPayload,
          paymentRequirements,
          declaredExtensions,
          cancellationDispatcher,
          beforeHandlerSettlement,
        } = result;

        const propagateHandlerError = async (
          error: unknown,
        ): Promise<never> => {
          replaceContextResponse(c, new Response());
          const cancelSettlement = await cancellationDispatcher.cancel({
            reason: "handler_threw",
            error,
          });
          const headers = httpServer.createFailurePathSettlementHeaders(
            cancelSettlement,
            beforeHandlerSettlement,
            paymentPayload,
          );
          Object.entries(headers ?? {}).forEach(([key, value]) => {
            c.header(key, value);
          });
          throw error;
        };

        const originalHeader = c.header;
        const handlerHeaders = new Set<string>();
        const errorHeaders = new Set<string>();
        c.header = (name, value, options) => {
          (c.error ? errorHeaders : handlerHeaders).add(name.toLowerCase());
          originalHeader.call(c, name, value, options);
        };
        try {
          await next();
        } catch (error) {
          c.header = originalHeader;
          await propagateHandlerError(error);
        }
        c.header = originalHeader;
        if (c.error) {
          const res = c.res ?? new Response();
          const responseHeaders = new Headers(res.headers);
          for (const name of handlerHeaders) {
            if (!errorHeaders.has(name)) responseHeaders.delete(name);
          }
          const cancelSettlement = await cancellationDispatcher.cancel({
            reason: "handler_threw",
            error: c.error,
          });
          const headers = httpServer.createFailurePathSettlementHeaders(
            cancelSettlement,
            beforeHandlerSettlement,
            paymentPayload,
            responseHeaders.get("cache-control"),
          );
          const sanitizedResponse = new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: responseHeaders,
          });
          replaceContextResponse(
            c,
            withResponseHeaders(sanitizedResponse, headers),
          );
          return;
        }

        let res = c.res;

        if (res && res.status >= 400) {
          const cancelSettlement = await cancellationDispatcher.cancel({
            reason: "handler_failed",
            responseStatus: res.status,
          });
          const headers = httpServer.createFailurePathSettlementHeaders(
            cancelSettlement,
            beforeHandlerSettlement,
            paymentPayload,
            res.headers.get("cache-control"),
          );
          replaceContextResponse(c, withResponseHeaders(res, headers));
          return;
        }

        let settleResult;
        try {
          settleResult = await httpServer.processSettlement(
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
              responseBody: res
                ? Buffer.from(await res.clone().arrayBuffer())
                : undefined,
              responseHeaders: toHeaderRecord(res?.headers),
            },
            undefined,
            beforeHandlerSettlement,
          );
        } catch (error) {
          replaceContextResponse(c, new Response());
          throw error;
        }

        if (!settleResult.success) {
          if (isFacilitatorUnavailable(settleResult.errorReason)) {
            replaceContextResponse(c, facilitatorUnavailableResponse());
            return;
          }
          const { response } = settleResult;
          replaceContextResponse(
            c,
            failureResponse(response.body, response.status, response.headers),
          );
          return;
        } else if (res) {
          res = withSuccessfulSettlementHeaders(res, settleResult.headers);
        }

        if (res) replaceContextResponse(c, res);
        return;
      }
    }
  };
}
