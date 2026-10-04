package facilitator

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

var (
	feeCacheMu    sync.RWMutex
	feeCacheStore *feeCache
)

func InvalidateFeeCache() {
	feeCacheMu.Lock()
	defer feeCacheMu.Unlock()
	feeCacheStore = nil
}

func isCacheValid() bool {
	if feeCacheStore == nil {
		return false
	}
	return time.Since(feeCacheStore.fetchedAt) < feeCacheStore.ttl
}

func GetFeeInfo(ctx context.Context, config *Config, cacheConfig *FeeCacheConfig) (*FeeInfo, error) {
	feeCacheMu.RLock()
	if isCacheValid() && feeCacheStore != nil {
		feeInfo := feeCacheStore.feeInfo
		feeCacheMu.RUnlock()
		return feeInfo, nil
	}
	feeCacheMu.RUnlock()

	url := ResolveURL(config)
	if err := ValidateURL(url); err != nil {
		return nil, err
	}

	httpClient := http.DefaultClient
	if config != nil && config.HTTPClient != nil {
		httpClient = config.HTTPClient
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url+"/supported", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch fee info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to fetch fee info: %d %s", resp.StatusCode, string(body))
	}

	var data SupportedResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if data.Fee == nil {
		return nil, ErrFeeNotFound
	}

	ttl := DefaultCacheTTL
	if cacheConfig != nil {
		ttl = cacheConfig.TTL
	}

	feeCacheMu.Lock()
	feeCacheStore = &feeCache{
		feeInfo:   data.Fee,
		fetchedAt: time.Now(),
		ttl:       ttl,
	}
	feeCacheMu.Unlock()

	return data.Fee, nil
}
