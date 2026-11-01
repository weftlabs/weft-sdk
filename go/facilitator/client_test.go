package facilitator

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestValidateURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"valid https", "https://x402.weft.network", false},
		{"valid http", "http://localhost:7676", false},
		{"empty string", "", true},
		{"whitespace only", "   ", true},
		{"no protocol", "x402.weft.network", true},
		{"ftp protocol", "ftp://x402.weft.network", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}

func TestResolveURL(t *testing.T) {
	t.Run("returns config URL when provided", func(t *testing.T) {
		url := ResolveURL(&Config{URL: "https://custom.example.com"})
		if url != "https://custom.example.com" {
			t.Errorf("got %q, want %q", url, "https://custom.example.com")
		}
	})

	t.Run("returns env var when no config", func(t *testing.T) {
		os.Setenv(EnvURL, "https://env.example.com")
		defer os.Unsetenv(EnvURL)

		url := ResolveURL(nil)
		if url != "https://env.example.com" {
			t.Errorf("got %q, want %q", url, "https://env.example.com")
		}
	})

	t.Run("prefers config over env", func(t *testing.T) {
		os.Setenv(EnvURL, "https://env.example.com")
		defer os.Unsetenv(EnvURL)

		url := ResolveURL(&Config{URL: "https://config.example.com"})
		if url != "https://config.example.com" {
			t.Errorf("got %q, want %q", url, "https://config.example.com")
		}
	})

	t.Run("returns default when no config no env", func(t *testing.T) {
		os.Unsetenv(EnvURL)

		url := ResolveURL(nil)
		if url != DefaultURL {
			t.Errorf("got %q, want %q", url, DefaultURL)
		}
	})
}

func TestNewFacilitatorClient(t *testing.T) {
	t.Run("creates client with default URL", func(t *testing.T) {
		os.Unsetenv(EnvURL)
		client, err := NewFacilitatorClient(nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if client.URL() != DefaultURL {
			t.Errorf("got URL %q, want %q", client.URL(), DefaultURL)
		}
	})

	t.Run("creates client with custom URL", func(t *testing.T) {
		client, err := NewFacilitatorClient(&Config{URL: "https://custom.example.com"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if client.URL() != "https://custom.example.com" {
			t.Errorf("got URL %q, want %q", client.URL(), "https://custom.example.com")
		}
	})

	t.Run("rejects invalid URL", func(t *testing.T) {
		_, err := NewFacilitatorClient(&Config{URL: "not-a-url"})
		if err == nil {
			t.Fatal("expected error for invalid URL")
		}
	})

	t.Run("refuses remote http URL before the API key is used", func(t *testing.T) {
		_, err := NewFacilitatorClient(&Config{URL: "http://x402.example"})
		if !errors.Is(err, ErrInvalidURL) || !strings.Contains(err.Error(), "use https://") {
			t.Fatalf("expected insecure URL error, got %v", err)
		}
		t.Setenv(EnvURL, "http://x402.example")
		if _, err := NewFacilitatorClient(nil); !errors.Is(err, ErrInvalidURL) {
			t.Fatalf("expected insecure env URL error, got %v", err)
		}
	})

	t.Run("uses custom HTTP client", func(t *testing.T) {
		customClient := &http.Client{Timeout: 10 * time.Second}
		client, err := NewFacilitatorClient(&Config{
			URL:        "https://x402.weft.network",
			HTTPClient: customClient,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if client == nil {
			t.Fatal("expected non-nil client")
		}
	})
}

func TestVerify(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/verify" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("unexpected method: %s", r.Method)
		}

		var req VerifyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}
		if req.X402Version != 2 {
			t.Errorf("unexpected x402Version: %d", req.X402Version)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyResponse{Valid: true, Message: "ok"})
	}))
	defer server.Close()

	client, err := NewFacilitatorClient(&Config{URL: server.URL})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resp, err := client.Verify(context.Background(), map[string]string{"sig": "abc"}, map[string]string{"amount": "1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Valid {
		t.Error("expected Valid to be true")
	}
}

func TestSettle(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/settle" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SettleResponse{Success: true, TxHash: "0xabc123"})
	}))
	defer server.Close()

	client, err := NewFacilitatorClient(&Config{URL: server.URL})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resp, err := client.Settle(context.Background(), map[string]string{"sig": "abc"}, map[string]string{"amount": "1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Error("expected Success to be true")
	}
	if resp.TxHash != "0xabc123" {
		t.Errorf("got TxHash %q, want %q", resp.TxHash, "0xabc123")
	}
}

func TestGetSupported(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/supported" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != "GET" {
			t.Errorf("unexpected method: %s", r.Method)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SupportedResponse{
			Kinds: []SupportedKind{
				{X402Version: 2, Scheme: "eip-3009", Network: "base-sepolia"},
			},
			Fee: &FeeInfo{Amount: "0.001", Asset: "USDC", Network: "base-sepolia"},
		})
	}))
	defer server.Close()

	client, err := NewFacilitatorClient(&Config{URL: server.URL})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resp, err := client.GetSupported(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Kinds) != 1 {
		t.Errorf("expected 1 kind, got %d", len(resp.Kinds))
	}
	if resp.Fee == nil {
		t.Fatal("expected fee to be present")
	}
	if resp.Fee.Amount != "0.001" {
		t.Errorf("got fee amount %q, want %q", resp.Fee.Amount, "0.001")
	}
}

func TestVerifyHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client, err := NewFacilitatorClient(&Config{URL: server.URL})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = client.Verify(context.Background(), nil, nil)
	if err == nil {
		t.Fatal("expected error for 500 response")
	}
}
