package facilitator

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNetHTTPFacilitatorIntegration(t *testing.T) {
	const (
		network = "eip155:84532"
		payTo   = "0x0000000000000000000000000000000000000001"
		asset   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
		apiKey  = "wk_live_seller"
	)
	var mu sync.Mutex
	var calls []recordedCall
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		calls = append(calls, recordedCall{
			path:    r.URL.Path,
			method:  r.Method,
			headers: r.Header.Clone(),
			body:    append([]byte(nil), body...),
		})
		mu.Unlock()
		switch r.URL.Path {
		case "/supported":
			_, _ = w.Write([]byte(`{"kinds":[{"x402Version":2,"scheme":"exact","network":"eip155:84532"}]}`))
		case "/verify":
			if r.Header.Get(APIKeyHeader) != apiKey {
				t.Errorf("verify missing X-API-Key, got %q", r.Header.Get(APIKeyHeader))
			}
			_, _ = w.Write([]byte(`{"isValid":true}`))
		case "/settle":
			if r.Header.Get(APIKeyHeader) != apiKey {
				t.Errorf("settle missing X-API-Key, got %q", r.Header.Get(APIKeyHeader))
			}
			_, _ = w.Write([]byte(`{"success":true,"transaction":"0xabc","network":"` + network + `"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer facilitator.Close()

	var handlerCalls int
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalls++
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("paid"))
	})
	middleware, err := PaymentMiddleware([]Route{
		{Pattern: "GET /v1/search", Config: RouteConfig{
			Accepts: paymentOption{
				Scheme:  "exact",
				Network: network,
				PayTo:   payTo,
				Price:   "$0.01",
			},
			Extensions: map[string]any{
				RequestExtensionKey: RequestExtension(func(*http.Request) (any, error) {
					return map[string]any{"model": "gpt", "max_tokens": 16}, nil
				}),
			},
		}},
	}, MiddlewareConfig{
		APIKey:       apiKey,
		Name:         "Acme Pricing API",
		Type:         "api",
		Tags:         []string{"finance"},
		ProductID:    "prod_1",
		ManifestHash: "abc",
		Facilitator:  &Config{URL: facilitator.URL},
		Schemes: []Scheme{{
			Name:    "exact",
			Network: network,
			ParsePrice: func(string) (string, string, map[string]any, error) {
				return "10000", asset, map[string]any{}, nil
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(handler))
	defer server.Close()

	unpaid, err := http.Get(server.URL + "/v1/search")
	if err != nil {
		t.Fatal(err)
	}
	defer unpaid.Body.Close()
	if unpaid.StatusCode != http.StatusPaymentRequired {
		t.Fatalf("unpaid status %d", unpaid.StatusCode)
	}
	challenge := decodeRequired(t, unpaid.Header.Get(paymentRequiredHeader))
	extensions, _ := challenge["extensions"].(map[string]any)
	product, _ := extensions["weft.product"].(map[string]any)
	info, _ := product["info"].(map[string]any)
	if info["kind"] != "api" || info["product_id"] != "prod_1" || info["manifest_hash"] != "abc" {
		t.Fatalf("product info %#v", info)
	}
	requestExt, _ := extensions[RequestExtensionKey].(map[string]any)
	requestInfo, _ := requestExt["info"].(map[string]any)
	if requestInfo["model"] != "gpt" || requestInfo["max_tokens"] != float64(16) {
		t.Fatalf("request extension %#v", requestExt)
	}
	resource, _ := challenge["resource"].(map[string]any)
	tags, _ := resource["tags"].([]any)
	if len(tags) == 0 || tags[0] != "weft:type:api" {
		t.Fatalf("tags %#v", resource["tags"])
	}
	if handlerCalls != 0 {
		t.Fatal("unpaid request ran the handler")
	}

	accepts := challenge["accepts"].([]any)
	payload := map[string]any{
		"x402Version": float64(2),
		"payload":     map[string]any{"signature": "0xsig"},
		"accepted":    accepts[0],
	}
	raw, _ := json.Marshal(payload)
	paidReq, _ := http.NewRequest(http.MethodGet, server.URL+"/v1/search", nil)
	paidReq.Header.Set(paymentSignatureHeader, base64.StdEncoding.EncodeToString(raw))
	paid, err := http.DefaultClient.Do(paidReq)
	if err != nil {
		t.Fatal(err)
	}
	defer paid.Body.Close()
	if paid.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(paid.Body)
		t.Fatalf("paid status %d body %s", paid.StatusCode, body)
	}
	if handlerCalls != 1 {
		t.Fatalf("handler calls %d", handlerCalls)
	}
	if paid.Header.Get(paymentResponseHeader) == "" {
		t.Fatal("missing settlement header")
	}
	settlement := decodeRequired(t, paid.Header.Get(paymentResponseHeader))
	if settlement["success"] != true || settlement["transaction"] != "0xabc" {
		t.Fatalf("settlement %#v", settlement)
	}
	settleBody := findCall(t, &mu, calls, "/settle")
	var settle map[string]any
	if err := json.Unmarshal(settleBody.body, &settle); err != nil {
		t.Fatal(err)
	}
	paidPayload, _ := settle["paymentPayload"].(map[string]any)
	if paidPayload["httpMethod"] != "GET" {
		t.Fatalf("settle method %#v", paidPayload["httpMethod"])
	}
	if findCall(t, &mu, calls, "/verify").headers.Get(APIKeyHeader) != apiKey {
		t.Fatal("verify did not receive X-API-Key")
	}
}

func TestHandlerErrorDoesNotSettle(t *testing.T) {
	var settled bool
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/settle" {
			settled = true
		}
		if r.URL.Path == "/verify" {
			_, _ = w.Write([]byte(`{"isValid":true}`))
			return
		}
		_, _ = w.Write([]byte(`{"kinds":[]}`))
	}))
	defer facilitator.Close()
	middleware := paidMiddleware(t, facilitator.URL, "wk_live_seller", true, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusInternalServerError)
	}))
	server := httptest.NewServer(middleware)
	defer server.Close()
	challenge := unpaidChallenge(t, server.URL)
	status := pay(t, server.URL, challenge)
	if status != http.StatusInternalServerError {
		t.Fatalf("status %d", status)
	}
	if settled {
		t.Fatal("handler error settled")
	}
}

func TestFacilitatorDownMatchesTypeScript(t *testing.T) {
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/settle" {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("upstream down"))
			return
		}
		if r.URL.Path == "/verify" {
			_, _ = w.Write([]byte(`{"isValid":true}`))
			return
		}
		_, _ = w.Write([]byte(`{"kinds":[]}`))
	}))
	defer facilitator.Close()
	middleware := paidMiddleware(t, facilitator.URL, "wk_live_seller", true, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("paid"))
	}))
	server := httptest.NewServer(middleware)
	defer server.Close()
	challenge := unpaidChallenge(t, server.URL)
	response := payResponse(t, server.URL, challenge)
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", response.StatusCode, body)
	}
	if string(body) != `{"error":"facilitator_unavailable"}` {
		t.Fatalf("body %s", body)
	}
	if response.Header.Get("Retry-After") != "1" {
		t.Fatalf("retry-after %q", response.Header.Get("Retry-After"))
	}
	if response.Header.Get("Cache-Control") != "private" {
		t.Fatalf("cache-control %q", response.Header.Get("Cache-Control"))
	}
	if response.Header.Get(paymentResponseHeader) != "" {
		t.Fatal("unavailable response kept a settlement header")
	}
}

func TestMalformedKeyIsNotSentOrLogged(t *testing.T) {
	const secret = "wk live secret"
	var lines []string
	previous := emitWarning
	emitWarning = func(line string) { lines = append(lines, line) }
	defer func() { emitWarning = previous }()
	var seen []string
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Header.Get("Authorization"), r.Header.Get(APIKeyHeader), r.URL.Path)
		_, _ = w.Write([]byte(`{"kinds":[],"isValid":true,"success":true,"transaction":"0x1","network":"eip155:84532"}`))
	}))
	defer facilitator.Close()
	middleware := paidMiddleware(t, facilitator.URL, secret, true, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	server := httptest.NewServer(middleware)
	defer server.Close()
	resp, err := http.Get(server.URL + "/v1/search")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if len(lines) != 1 {
		t.Fatalf("warnings %#v", lines)
	}
	for _, line := range lines {
		if strings.Contains(line, secret) {
			t.Fatalf("key logged in %q", line)
		}
	}
	for _, value := range seen {
		if strings.Contains(value, secret) || strings.Contains(value, "wk") {
			t.Fatalf("key sent on facilitator call: %#v", seen)
		}
	}
}

func TestResumeSkipsVerifyAndStillSettles(t *testing.T) {
	var verified bool
	var settled bool
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/verify" {
			verified = true
		}
		if r.URL.Path == "/settle" {
			settled = true
			_, _ = w.Write([]byte(`{"success":true,"transaction":"0xresume","network":"eip155:84532"}`))
			return
		}
		_, _ = w.Write([]byte(`{"kinds":[]}`))
	}))
	defer facilitator.Close()
	middleware, err := PaymentMiddleware([]Route{
		{Pattern: "POST /v1/search", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "$0.01"}}},
	}, MiddlewareConfig{
		APIKey:      "wk_live_seller",
		Facilitator: &Config{URL: facilitator.URL},
		Schemes: []Scheme{{Name: "exact", ParsePrice: func(string) (string, string, map[string]any, error) {
			return "1", "0xasset", nil, nil
		}}},
		Resume: func(*http.Request, map[string]any) (map[string]any, bool) {
			return map[string]any{"x402Version": float64(2), "accepted": map[string]any{"scheme": "exact", "network": "eip155:84532"}}, true
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})))
	defer server.Close()
	unpaid, err := http.NewRequest(http.MethodPost, server.URL+"/v1/search", nil)
	if err != nil {
		t.Fatal(err)
	}
	unpaidResp, err := http.DefaultClient.Do(unpaid)
	if err != nil {
		t.Fatal(err)
	}
	unpaidResp.Body.Close()
	challenge := decodeRequired(t, unpaidResp.Header.Get(paymentRequiredHeader))
	payload := map[string]any{
		"x402Version": float64(2),
		"accepted":    challenge["accepts"].([]any)[0],
	}
	raw, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/v1/search", nil)
	req.Header.Set(paymentSignatureHeader, base64.StdEncoding.EncodeToString(raw))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if verified {
		t.Fatal("resume still called verify")
	}
	if !settled {
		t.Fatal("resume did not settle")
	}
	if resp.Header.Get(paymentResponseHeader) == "" {
		t.Fatal("missing settlement header")
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "ok" {
		t.Fatalf("body %q", body)
	}
}

func TestSyncRetryFloor(t *testing.T) {
	var calls int
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/supported" {
			calls++
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`{"isValid":true}`))
	}))
	defer facilitator.Close()
	start := time.Unix(1_700_000_000, 0)
	previous := nowFunc
	nowFunc = func() time.Time { return start }
	defer func() { nowFunc = previous }()
	middleware := paidMiddleware(t, facilitator.URL, "wk_live_seller", true, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	server := httptest.NewServer(middleware)
	defer server.Close()
	for i := 0; i < 3; i++ {
		resp, err := http.Get(server.URL + "/v1/search")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}
	if calls != 1 {
		t.Fatalf("supported calls during the floor %d, want 1", calls)
	}
	nowFunc = func() time.Time { return start.Add(syncRetryFloor) }
	resp, err := http.Get(server.URL + "/v1/search")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	deadline := time.Now().Add(time.Second)
	for calls < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if calls != 2 {
		t.Fatalf("supported calls after the floor %d, want 2", calls)
	}
}

type recordedCall struct {
	path    string
	method  string
	headers http.Header
	body    []byte
}

func findCall(t *testing.T, mu *sync.Mutex, calls []recordedCall, path string) recordedCall {
	t.Helper()
	mu.Lock()
	defer mu.Unlock()
	for _, call := range calls {
		if call.path == path {
			return call
		}
	}
	t.Fatalf("no %s call", path)
	return recordedCall{}
}

func decodeRequired(t *testing.T, header string) map[string]any {
	t.Helper()
	if header == "" {
		t.Fatal("missing payment header")
	}
	raw, err := base64.StdEncoding.DecodeString(header)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func paidMiddleware(t *testing.T, facilitatorURL, apiKey string, keySet bool, handler http.Handler) http.Handler {
	t.Helper()
	middleware, err := PaymentMiddleware([]Route{
		{Pattern: "GET /v1/search", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "$0.01"}}},
	}, MiddlewareConfig{
		APIKey:      apiKey,
		APIKeySet:   keySet,
		Facilitator: &Config{URL: facilitatorURL},
		Schemes: []Scheme{{
			Name: "exact",
			ParsePrice: func(string) (string, string, map[string]any, error) {
				return "1", "0xasset", nil, nil
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	return middleware(handler)
}

func unpaidChallenge(t *testing.T, serverURL string) map[string]any {
	t.Helper()
	resp, err := http.Get(serverURL + "/v1/search")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	return decodeRequired(t, resp.Header.Get(paymentRequiredHeader))
}

func pay(t *testing.T, serverURL string, challenge map[string]any) int {
	t.Helper()
	resp := payResponse(t, serverURL, challenge)
	defer resp.Body.Close()
	return resp.StatusCode
}

func payResponse(t *testing.T, serverURL string, challenge map[string]any) *http.Response {
	t.Helper()
	accepts := challenge["accepts"].([]any)
	payload := map[string]any{"x402Version": float64(2), "accepted": accepts[0], "payload": map[string]any{}}
	raw, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodGet, serverURL+"/v1/search", nil)
	req.Header.Set(paymentSignatureHeader, base64.StdEncoding.EncodeToString(raw))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}
