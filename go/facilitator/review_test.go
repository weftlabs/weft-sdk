package facilitator

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVerifyUsesTheRequirementTheBuyerPaid(t *testing.T) {
	var verified, settled map[string]any
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		_ = json.Unmarshal(body, &decoded)
		switch r.URL.Path {
		case "/verify":
			verified, _ = decoded["paymentRequirements"].(map[string]any)
			_, _ = w.Write([]byte(`{"isValid":true}`))
		case "/settle":
			settled, _ = decoded["paymentRequirements"].(map[string]any)
			_, _ = w.Write([]byte(`{"success":true,"transaction":"0x1","network":"eip155:84532"}`))
		default:
			_, _ = w.Write([]byte(`{"kinds":[]}`))
		}
	}))
	defer facilitator.Close()

	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{
			Accepts: []paymentOption{
				{Scheme: "exact", Network: "eip155:8453", PayTo: "0xbase", Price: "1"},
				{Scheme: "exact", Network: "eip155:84532", PayTo: "0xsepolia", Price: "1"},
			},
		}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes: []Scheme{
			{Name: "exact", Network: "eip155:8453", ParsePrice: fixedPrice("100", "0xusdc")},
			{Name: "exact", Network: "eip155:84532", ParsePrice: fixedPrice("200", "0xusdc")},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})))
	defer server.Close()

	challenge := getChallenge(t, server.URL+"/paid")
	accepts := challenge["accepts"].([]any)
	var chosen map[string]any
	for _, item := range accepts {
		option := item.(map[string]any)
		if option["network"] == "eip155:84532" {
			chosen = option
		}
	}
	if chosen == nil {
		t.Fatal("challenge omitted the second requirement")
	}
	payWith(t, server.URL+"/paid", chosen)
	if verified["network"] != "eip155:84532" || verified["amount"] != "200" || verified["payTo"] != "0xsepolia" {
		t.Fatalf("verify used %#v, want the sepolia requirement", verified)
	}
	if settled["network"] != "eip155:84532" || settled["amount"] != "200" {
		t.Fatalf("settle used %#v, want the sepolia requirement", settled)
	}
}

func TestInvalidFacilitatorURLIsAConstructionError(t *testing.T) {
	_, err := PaymentMiddleware([]Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: "not-a-url"},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err == nil {
		t.Fatal("invalid facilitator URL was accepted; payments would fall back to production")
	}
}

func TestSettlementOverrideUsesHalfTheMatchedAmount(t *testing.T) {
	var settled map[string]any
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.URL.Path == "/settle" {
			var decoded map[string]any
			_ = json.Unmarshal(body, &decoded)
			settled, _ = decoded["paymentRequirements"].(map[string]any)
			_, _ = w.Write([]byte(`{"success":true,"transaction":"0x1","network":"eip155:84532"}`))
			return
		}
		if r.URL.Path == "/verify" {
			_, _ = w.Write([]byte(`{"isValid":true}`))
			return
		}
		_, _ = w.Write([]byte(`{"kinds":[]}`))
	}))
	defer facilitator.Close()
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("10000", "0xusdc")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Settlement-Overrides", `{"amount":"50%"}`)
		_, _ = w.Write([]byte("ok"))
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	payWith(t, server.URL+"/paid", challenge["accepts"].([]any)[0].(map[string]any))
	if settled["amount"] != "5000" {
		t.Fatalf("settled amount %v, want 5000", settled["amount"])
	}
}

func TestMalformedSettlementOverrideIsIgnored(t *testing.T) {
	var settled map[string]any
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.URL.Path == "/settle" {
			var decoded map[string]any
			_ = json.Unmarshal(body, &decoded)
			settled, _ = decoded["paymentRequirements"].(map[string]any)
			_, _ = w.Write([]byte(`{"success":true,"transaction":"0x1","network":"eip155:84532"}`))
			return
		}
		if r.URL.Path == "/verify" {
			_, _ = w.Write([]byte(`{"isValid":true}`))
			return
		}
		_, _ = w.Write([]byte(`{"kinds":[]}`))
	}))
	defer facilitator.Close()
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("10000", "0xusdc")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Settlement-Overrides", `{not-json`)
		_, _ = w.Write([]byte("ok"))
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	payWith(t, server.URL+"/paid", challenge["accepts"].([]any)[0].(map[string]any))
	if settled["amount"] != "10000" {
		t.Fatalf("malformed override changed amount to %#v", settled["amount"])
	}
}

func TestHandler422StripsUnsafeFailureHeaders(t *testing.T) {
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
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Settlement-Overrides", `{"amount":"50%"}`)
		w.Header().Set("Location", "/success")
		w.Header().Add("Set-Cookie", "a=1")
		w.Header().Add("Set-Cookie", "b=2")
		w.Header().Set("Cache-Control", "public, max-age=60")
		w.Header().Set("X-Keep", "yes")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":"invalid"}`))
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	resp := payResponseTo(t, server.URL+"/paid", challenge["accepts"].([]any)[0].(map[string]any))
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	if resp.Header.Get("Settlement-Overrides") != "" {
		t.Fatalf("Settlement-Overrides leaked: %q", resp.Header.Get("Settlement-Overrides"))
	}
	if resp.Header.Get("Location") != "" {
		t.Fatalf("Location leaked: %q", resp.Header.Get("Location"))
	}
	if cookies := resp.Header.Values("Set-Cookie"); len(cookies) != 0 {
		t.Fatalf("Set-Cookie leaked: %#v", cookies)
	}
	if strings.Contains(strings.ToLower(resp.Header.Get("Cache-Control")), "public") {
		t.Fatalf("public Cache-Control leaked: %q", resp.Header.Get("Cache-Control"))
	}
	if resp.Header.Get("X-Keep") != "yes" {
		t.Fatalf("safe header %q, want yes", resp.Header.Get("X-Keep"))
	}
	if settled {
		t.Fatal("422 handler settled")
	}
}

func TestDollarOverrideWithoutDecimalsFailsClosed(t *testing.T) {
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
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("10000", "0xusdc")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Settlement-Overrides", `{"amount":"$0.50"}`)
		_, _ = w.Write([]byte("ok"))
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	resp := payResponseTo(t, server.URL+"/paid", challenge["accepts"].([]any)[0].(map[string]any))
	defer resp.Body.Close()
	if settled {
		t.Fatal("dollar override with unknown decimals settled the full amount")
	}
	if resp.StatusCode == http.StatusOK {
		t.Fatal("dollar override with unknown decimals returned the handler body")
	}
}

func TestColonAndBracketRoutesAreProtected(t *testing.T) {
	for _, pattern := range []string{"GET /v1/:id", "GET /v1/[id]", "GET /files/*"} {
		t.Run(pattern, func(t *testing.T) {
			var hit bool
			middleware, err := mustMiddleware(t, []Route{
				{Pattern: pattern, Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
			}, MiddlewareConfig{
				Facilitator: &Config{URL: "https://facilitator.example"},
				Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
			})
			if err != nil {
				t.Fatal(err)
			}
			server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				hit = true
				w.WriteHeader(http.StatusOK)
			})))
			defer server.Close()
			path := "/v1/abc"
			if strings.Contains(pattern, "/files") {
				path = "/files/a/b"
			}
			resp, err := http.Get(server.URL + path)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusPaymentRequired || hit {
				t.Fatalf("%s status %d hit %v; route was not protected", pattern, resp.StatusCode, hit)
			}
		})
	}
}

func TestUnknownRoutePatternIsAConstructionError(t *testing.T) {
	_, err := PaymentMiddleware([]Route{
		{Pattern: "GET /v1/{id}", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: "https://facilitator.example"},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err == nil {
		t.Fatal("unknown {id} pattern was accepted and would pass through unpaid")
	}
}

func TestRoutePaymentFlowRejectedAtConstruction(t *testing.T) {
	scheme := Scheme{
		Name:                       "exact",
		DefaultAssetTransferMethod: "authorization",
		ParsePrice:                 fixedPrice("1", "0xasset"),
		PaymentFlows: map[string]FlowSupport{
			"authorization": {Supported: []string{"authorization"}, Default: "authorization"},
		},
	}
	cases := []struct {
		name string
		flow string
		want string
	}{
		{
			name: "escrow",
			flow: "escrow",
			want: `[x402] Scheme "exact" assetTransferMethod "authorization" does not support paymentFlow "escrow". Supported: authorization (default: authorization).`,
		},
		{
			name: "upfront",
			flow: "upfront",
			want: `[x402] Scheme "exact" assetTransferMethod "authorization" does not support paymentFlow "upfront". Supported: authorization (default: authorization).`,
		},
		{
			name: "undeclared",
			flow: "wire",
			want: `[x402] Scheme "exact" assetTransferMethod "authorization" does not support paymentFlow "wire". Supported: authorization (default: authorization).`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := PaymentMiddleware([]Route{{
				Pattern: "GET /paid",
				Config: RouteConfig{Accepts: paymentOption{
					Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1",
					Extra: map[string]any{"paymentFlow": tc.flow},
				}},
			}}, MiddlewareConfig{
				Facilitator: &Config{URL: "https://facilitator.example"},
				Schemes:     []Scheme{scheme},
			})
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %v, want %s", err, tc.want)
			}
		})
	}
	_, err := PaymentMiddleware([]Route{{
		Pattern: "GET /paid",
		Config: RouteConfig{Accepts: paymentOption{
			Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1",
			Extra: map[string]any{"paymentFlow": "authorization"},
		}},
	}}, MiddlewareConfig{
		Facilitator: &Config{URL: "https://facilitator.example"},
		Schemes:     []Scheme{scheme},
	})
	if err != nil {
		t.Fatalf("declared authorization flow was rejected: %v", err)
	}
}

func TestBeforeHandlerFlowIsRefusedAtConstruction(t *testing.T) {
	_, err := PaymentMiddleware([]Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: "https://facilitator.example"},
		Schemes: []Scheme{{
			Name:       "exact",
			ParsePrice: fixedPrice("1", "0xasset"),
			PaymentFlows: map[string]FlowSupport{
				"default": {Supported: []string{"upfront"}, Default: "upfront"},
			},
		}},
	})
	if err == nil {
		t.Fatal("upfront flow was accepted; the middleware would settle after the handler")
	}
	if !strings.Contains(err.Error(), "before the handler") && !strings.Contains(err.Error(), "upfront") {
		t.Fatalf("error %v does not name the refused flow", err)
	}
}

func TestExtensionEchoMismatchDoesNotVerify(t *testing.T) {
	var verified bool
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/verify" {
			verified = true
		}
		_, _ = w.Write([]byte(`{"kinds":[],"isValid":true}`))
	}))
	defer facilitator.Close()
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		ProductID:   "prod_1",
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler ran after an extension echo mismatch")
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	accepted := challenge["accepts"].([]any)[0]
	payload := map[string]any{
		"x402Version": float64(2),
		"accepted":    accepted,
		"payload":     map[string]any{},
		"extensions": map[string]any{
			"weft.product": map[string]any{"info": map[string]any{"product_id": "prod_other"}},
		},
	}
	resp := payPayload(t, server.URL+"/paid", payload)
	defer resp.Body.Close()
	if verified {
		t.Fatal("verify ran after extension_echo_mismatch")
	}
	if resp.StatusCode != http.StatusPaymentRequired {
		t.Fatalf("status %d, want 402", resp.StatusCode)
	}
	decoded := decodeRequired(t, resp.Header.Get(paymentRequiredHeader))
	if decoded["error"] != "extension_echo_mismatch" {
		t.Fatalf("error %#v, want extension_echo_mismatch", decoded["error"])
	}
}

func TestSettlementPendingRetriesOnce(t *testing.T) {
	var settles int
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/settle" {
			if r.URL.Path == "/verify" {
				_, _ = w.Write([]byte(`{"isValid":true}`))
				return
			}
			_, _ = w.Write([]byte(`{"kinds":[]}`))
			return
		}
		settles++
		if settles == 1 {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"success":false,"errorReason":"settlement_pending","transaction":"0xpending","network":"eip155:84532"}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"transaction":"0xpending","network":"eip155:84532"}`))
	}))
	defer facilitator.Close()
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	resp := payResponseTo(t, server.URL+"/paid", challenge["accepts"].([]any)[0].(map[string]any))
	defer resp.Body.Close()
	if settles != 2 {
		t.Fatalf("settle calls %d, want 2", settles)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestVerifyUnavailableIs503(t *testing.T) {
	facilitator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/verify" {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("upstream down"))
			return
		}
		_, _ = w.Write([]byte(`{"kinds":[]}`))
	}))
	defer facilitator.Close()
	middleware, err := mustMiddleware(t, []Route{
		{Pattern: "GET /paid", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: facilitator.URL},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler ran while the facilitator was down")
	})))
	defer server.Close()
	challenge := getChallenge(t, server.URL+"/paid")
	resp := payResponseTo(t, server.URL+"/paid", challenge["accepts"].([]any)[0].(map[string]any))
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusServiceUnavailable || string(body) != `{"error":"facilitator_unavailable"}` {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
}

func TestRoutePriceFollowsDeclarationOrder(t *testing.T) {
	priceOf := func(price string) func(string) (string, string, map[string]any, error) {
		return func(string) (string, string, map[string]any, error) {
			return price, "0xasset", map[string]any{}, nil
		}
	}
	orders := []struct {
		name   string
		routes []Route
		want   string
	}{
		{
			name: "wildcard first",
			want: "0.01",
			routes: []Route{
				{Pattern: "/api/*", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "0.01"}}},
				{Pattern: "/api/premium", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1.00"}}},
			},
		},
		{
			name: "premium first",
			want: "1.00",
			routes: []Route{
				{Pattern: "/api/premium", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "1.00"}}},
				{Pattern: "/api/*", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Network: "eip155:84532", PayTo: "0x1", Price: "0.01"}}},
			},
		},
	}
	for _, order := range orders {
		t.Run(order.name, func(t *testing.T) {
			middleware, err := PaymentMiddleware(order.routes, MiddlewareConfig{
				Facilitator: &Config{URL: "https://facilitator.example"},
				SyncOnStart: boolPtr(false),
				Schemes:     []Scheme{{Name: "exact", ParsePrice: priceOf("unused")}},
			})
			if err != nil {
				t.Fatal(err)
			}
			// Price comes from the matched route, not from a shared parser.
			middleware, err = PaymentMiddleware(order.routes, MiddlewareConfig{
				Facilitator: &Config{URL: "https://facilitator.example"},
				SyncOnStart: boolPtr(false),
				Schemes: []Scheme{{Name: "exact", ParsePrice: func(price string) (string, string, map[string]any, error) {
					return price, "0xasset", map[string]any{}, nil
				}}},
			})
			if err != nil {
				t.Fatal(err)
			}
			server := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				t.Fatal("protected route was not matched")
			})))
			defer server.Close()
			for i := 0; i < 1000; i++ {
				challenge := getChallenge(t, server.URL+"/api/premium")
				accepts := challenge["accepts"].([]any)
				if accepts[0].(map[string]any)["amount"] != order.want {
					t.Fatalf("request %d amount %v, want %s", i, accepts[0].(map[string]any)["amount"], order.want)
				}
			}
		})
	}
}

func TestDuplicateRoutePatternIsAConstructionError(t *testing.T) {
	_, err := PaymentMiddleware([]Route{
		{Pattern: "/api/premium", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Price: "1", PayTo: "0x1"}}},
		{Pattern: "/api/premium", Config: RouteConfig{Accepts: paymentOption{Scheme: "exact", Price: "2", PayTo: "0x1"}}},
	}, MiddlewareConfig{
		Facilitator: &Config{URL: "https://facilitator.example"},
		Schemes:     []Scheme{{Name: "exact", ParsePrice: fixedPrice("1", "0xasset")}},
	})
	if err == nil {
		t.Fatal("duplicate pattern was accepted")
	}
}

func TestPatternBackslashIsLiteral(t *testing.T) {
	_, re, err := compilePattern(`GET /v1/\d`)
	if err != nil {
		t.Fatal(err)
	}
	if re.MatchString("/v1/5") {
		t.Fatal(`\\d matched a digit; the backslash was not escaped`)
	}
	if !re.MatchString(`/v1/\d`) {
		t.Fatal(`literal backslash-d did not match`)
	}
}

func boolPtr(value bool) *bool { return &value }

func mustMiddleware(t *testing.T, routes []Route, cfg MiddlewareConfig) (func(http.Handler) http.Handler, error) {
	t.Helper()
	return PaymentMiddleware(routes, cfg)
}

func fixedPrice(amount, asset string) func(string) (string, string, map[string]any, error) {
	return func(string) (string, string, map[string]any, error) {
		return amount, asset, map[string]any{}, nil
	}
}

func getChallenge(t *testing.T, url string) map[string]any {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPaymentRequired {
		t.Fatalf("unpaid status %d", resp.StatusCode)
	}
	return decodeRequired(t, resp.Header.Get(paymentRequiredHeader))
}

func payWith(t *testing.T, url string, accepted map[string]any) {
	t.Helper()
	resp := payResponseTo(t, url, accepted)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("paid status %d body %s", resp.StatusCode, body)
	}
}

func payResponseTo(t *testing.T, url string, accepted map[string]any) *http.Response {
	t.Helper()
	return payPayload(t, url, map[string]any{
		"x402Version": float64(2),
		"accepted":    accepted,
		"payload":     map[string]any{},
	})
}

func payPayload(t *testing.T, url string, payload map[string]any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set(paymentSignatureHeader, base64.StdEncoding.EncodeToString(raw))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}
