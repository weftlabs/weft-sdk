package facilitator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestGetFeeInfo(t *testing.T) {
	// Reset cache before each test
	InvalidateFeeCache()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/supported" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{
			Fee: &FeeInfo{Amount: "0.001", Asset: "USDC", Network: "base-sepolia"},
		})
	}))
	defer server.Close()

	fee, err := GetFeeInfo(context.Background(), &Config{URL: server.URL}, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fee.Amount != "0.001" {
		t.Errorf("got amount %q, want %q", fee.Amount, "0.001")
	}
	if fee.Asset != "USDC" {
		t.Errorf("got asset %q, want %q", fee.Asset, "USDC")
	}
	if fee.Network != "base-sepolia" {
		t.Errorf("got network %q, want %q", fee.Network, "base-sepolia")
	}
}

func TestGetFeeInfoCaching(t *testing.T) {
	InvalidateFeeCache()

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{
			Fee: &FeeInfo{Amount: "0.001", Asset: "USDC", Network: "base-sepolia"},
		})
	}))
	defer server.Close()

	config := &Config{URL: server.URL}

	_, err := GetFeeInfo(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("first call: %v", err)
	}

	_, err = GetFeeInfo(context.Background(), config, nil)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}

	if callCount != 1 {
		t.Errorf("expected 1 HTTP call (cached), got %d", callCount)
	}
}

func TestGetFeeInfoInvalidation(t *testing.T) {
	InvalidateFeeCache()

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{
			Fee: &FeeInfo{Amount: "0.001", Asset: "USDC", Network: "base-sepolia"},
		})
	}))
	defer server.Close()

	config := &Config{URL: server.URL}

	_, _ = GetFeeInfo(context.Background(), config, nil)
	InvalidateFeeCache()
	_, _ = GetFeeInfo(context.Background(), config, nil)

	if callCount != 2 {
		t.Errorf("expected 2 HTTP calls after invalidation, got %d", callCount)
	}
}

func TestGetFeeInfoFeeNotFound(t *testing.T) {
	InvalidateFeeCache()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{Fee: nil})
	}))
	defer server.Close()

	_, err := GetFeeInfo(context.Background(), &Config{URL: server.URL}, nil)
	if err == nil {
		t.Fatal("expected error when fee not found")
	}
	if err != ErrFeeNotFound {
		t.Errorf("expected ErrFeeNotFound, got %v", err)
	}
}

func TestGetFeeInfoEmptyAmount(t *testing.T) {
	InvalidateFeeCache()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{
			Fee: &FeeInfo{Amount: "", Asset: "USDC", Network: "base-sepolia"},
		})
	}))
	defer server.Close()

	fee, err := GetFeeInfo(context.Background(), &Config{URL: server.URL}, nil)
	if err != nil {
		t.Fatalf("empty amount is still a string, got %v", err)
	}
	if fee.Amount != "" || fee.Asset != "USDC" {
		t.Fatalf("fee = %#v", fee)
	}
}

func TestGetFeeInfoCustomTTL(t *testing.T) {
	InvalidateFeeCache()

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{
			Fee: &FeeInfo{Amount: "0.001", Asset: "USDC", Network: "base-sepolia"},
		})
	}))
	defer server.Close()

	config := &Config{URL: server.URL}

	// Use a very short TTL
	_, _ = GetFeeInfo(context.Background(), config, &FeeCacheConfig{TTL: 1 * time.Millisecond})

	// Wait for cache to expire
	time.Sleep(10 * time.Millisecond)

	_, _ = GetFeeInfo(context.Background(), config, &FeeCacheConfig{TTL: 1 * time.Millisecond})

	if callCount != 2 {
		t.Errorf("expected 2 calls after TTL expiry, got %d", callCount)
	}
}

func TestGetFeeInfoHTTPError(t *testing.T) {
	InvalidateFeeCache()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("server error"))
	}))
	defer server.Close()

	_, err := GetFeeInfo(context.Background(), &Config{URL: server.URL}, nil)
	if err == nil {
		t.Fatal("expected error for 500 response")
	}
}
