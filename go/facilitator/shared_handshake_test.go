package facilitator

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// A middleware built per request must not handshake per request.

func supportedServer(t *testing.T, status int, calls *atomic.Int32, authSeen *atomic.Bool) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/supported" {
			calls.Add(1)
			if r.Header.Get("Authorization") != "" && authSeen != nil {
				authSeen.Store(true)
			}
			if status != http.StatusOK {
				http.Error(w, "down", status)
				return
			}
			_, _ = w.Write([]byte(`{"kinds":[],"fee":{"amount":"1","asset":"USDC","network":"n"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"isValid":true}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func driveOnce(t *testing.T, facilitatorURL, apiKey string) {
	t.Helper()
	server := httptest.NewServer(paidMiddleware(t, facilitatorURL, apiKey, true, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})))
	defer server.Close()
	resp, err := http.Get(server.URL + "/v1/search")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
}

func TestManyConstructionsMakeOneSupportedCall(t *testing.T) {
	resetSharedSupported()
	var calls atomic.Int32
	facilitator := supportedServer(t, http.StatusOK, &calls, nil)
	for i := 0; i < 5; i++ {
		driveOnce(t, facilitator.URL, "wk_live_a")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("supported calls %d, want 1", got)
	}
	driveOnce(t, facilitator.URL, "wk_live_b")
	if got := calls.Load(); got != 2 {
		t.Fatalf("supported calls after a different key %d, want 2", got)
	}
}

func TestSharedFailureHoldsTheFloorAcrossConstructions(t *testing.T) {
	resetSharedSupported()
	var calls atomic.Int32
	facilitator := supportedServer(t, http.StatusBadGateway, &calls, nil)
	start := time.Unix(1_700_000_000, 0)
	previous := nowFunc
	nowFunc = func() time.Time { return start }
	defer func() { nowFunc = previous }()
	driveOnce(t, facilitator.URL, "wk_live_a")
	driveOnce(t, facilitator.URL, "wk_live_a")
	if got := calls.Load(); got != 1 {
		t.Fatalf("supported calls inside the floor %d, want 1", got)
	}
	nowFunc = func() time.Time { return start.Add(syncRetryFloor) }
	driveOnce(t, facilitator.URL, "wk_live_a")
	if got := calls.Load(); got != 2 {
		t.Fatalf("supported calls after the floor %d, want 2", got)
	}
}

func TestWarnsOnceWhenConstructedManyTimes(t *testing.T) {
	resetSharedSupported()
	var lines []string
	previous := emitWarning
	emitWarning = func(line string) { lines = append(lines, line) }
	defer func() { emitWarning = previous }()
	for i := 0; i < constructionWarnThreshold+5; i++ {
		_, err := PaymentMiddleware(nil, MiddlewareConfig{Facilitator: &Config{URL: "http://127.0.0.1:1"}})
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(lines) != 1 {
		t.Fatalf("warnings %d, want 1: %v", len(lines), lines)
	}
}

func TestFeeRefreshIsNotAHandshake(t *testing.T) {
	InvalidateFeeCache()
	defer InvalidateFeeCache()
	var calls atomic.Int32
	var authSeen atomic.Bool
	facilitator := supportedServer(t, http.StatusOK, &calls, &authSeen)
	_, err := GetFeeInfo(context.Background(), &Config{
		URL: facilitator.URL,
		Auth: func(string) (map[string]string, error) {
			return map[string]string{"Authorization": "Bearer wk_live_a"}, nil
		},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if authSeen.Load() {
		t.Fatal("fee refresh carried a seller credential")
	}
}
