import { createFacilitatorClient, WeftFacilitatorConfig } from "./client";

export interface FeeInfo {
  amount: string;
  asset: string;
  network: string;
}

export interface FeeCacheConfig {
  ttl?: number;
}

interface FeeCache {
  feeInfo: FeeInfo;
  fetchedAt: number;
  ttl: number;
}

const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

let feeCache: FeeCache | null = null;

export function invalidateFeeCache(): void {
  feeCache = null;
}

function isCacheValid(): boolean {
  if (!feeCache) return false;
  const now = Date.now();
  return now - feeCache.fetchedAt < feeCache.ttl;
}

export async function getFeeInfo(
  config?: WeftFacilitatorConfig,
  cacheConfig?: FeeCacheConfig,
): Promise<FeeInfo> {
  if (isCacheValid() && feeCache) {
    return feeCache.feeInfo;
  }

  // Fee data is public. The seller's auth headers stay off this call: a valid
  // key on `/supported` is an identity handshake, not a fee lookup.
  const client = createFacilitatorClient(config && { url: config.url });
  const supported = await client.getSupported();

  const fee = (supported as { fee?: FeeInfo }).fee;
  if (!fee) {
    throw new Error("Fee information not found in /supported response");
  }

  if (typeof fee.amount !== "string") {
    throw new Error("Invalid fee structure: amount must be a string");
  }
  if (typeof fee.asset !== "string") {
    throw new Error("Invalid fee structure: asset must be a string");
  }
  if (typeof fee.network !== "string") {
    throw new Error("Invalid fee structure: network must be a string");
  }

  const feeInfo: FeeInfo = {
    amount: fee.amount,
    asset: fee.asset,
    network: fee.network,
  };

  feeCache = {
    feeInfo,
    fetchedAt: Date.now(),
    ttl: cacheConfig?.ttl ?? DEFAULT_CACHE_TTL,
  };

  return feeInfo;
}
