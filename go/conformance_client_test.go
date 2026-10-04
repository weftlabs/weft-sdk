package weft

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestClientConformance(t *testing.T) {
	cases := loadClientCases(t)
	if len(cases) == 0 {
		t.Fatal("no client conformance cases")
	}
	for _, loaded := range cases {
		loaded := loaded
		t.Run(loaded.file+"/"+loaded.name, func(t *testing.T) {
			if languages, ok := loaded.raw["languages"].([]any); ok && !allowsLanguage(languages, "go") {
				t.Fatalf("case lists languages without go; do not skip a concept Go can express")
			}
			runClientCase(t, loaded.raw)
		})
	}
}

type loadedCase struct {
	file string
	name string
	raw  map[string]any
}

func loadClientCases(t *testing.T) []loadedCase {
	t.Helper()
	dir := filepath.Join("..", "conformance", "client")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read conformance client dir: %v", err)
	}
	var loaded []loadedCase
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		payload, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name(), err)
		}
		var items []map[string]any
		if err := json.Unmarshal(payload, &items); err != nil {
			t.Fatalf("%s must be an array: %v", entry.Name(), err)
		}
		for _, item := range items {
			name, _ := item["name"].(string)
			loaded = append(loaded, loadedCase{file: entry.Name(), name: name, raw: item})
		}
	}
	return loaded
}

func allowsLanguage(languages []any, want string) bool {
	for _, language := range languages {
		if language == want {
			return true
		}
	}
	return false
}

func runClientCase(t *testing.T, testCase map[string]any) {
	t.Helper()
	var recorded *http.Request
	var recordedBody []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorded = r.Clone(r.Context())
		recordedBody, _ = io.ReadAll(r.Body)
		writeFixtureResponse(w, mapField(testCase, "response"))
	}))
	defer server.Close()

	response := mapField(testCase, "response")
	networkFailure := boolField(response, "networkFailure")
	transport := &recordingTransport{
		server:         server,
		networkFailure: networkFailure,
	}
	clientSpec := mapField(testCase, "client")
	options := Options{HTTPClient: &http.Client{Transport: transport}}
	if value, ok := clientSpec["baseUrl"]; ok {
		options.BaseURL, _ = value.(string)
	}
	_, hasKey := clientSpec["credential"]
	_, hasToken := clientSpec["accessToken"]
	if hasKey {
		options.APIKey, _ = clientSpec["credential"].(string)
	}
	if hasToken {
		options.AccessToken, _ = clientSpec["accessToken"].(string)
	}

	client, err := NewClient(options)
	call := mapField(testCase, "call")
	if err == nil {
		_, err = invokeClient(client, call)
	}
	if boolField(testCase, "expectValidationError") {
		if !errors.Is(err, ErrValidation) {
			t.Fatalf("expected validation error, got %v", err)
		}
		if transport.calls != 0 {
			t.Fatalf("validation error issued %d requests", transport.calls)
		}
		return
	}
	if err != nil && testCase["expectError"] == nil {
		t.Fatalf("call failed: %v", err)
	}
	if expected, ok := testCase["expectError"].(map[string]any); ok {
		assertClientError(t, err, expected)
	} else if result := lastResult; result != nil {
		assertClientResult(t, result, testCase["expectResult"])
	} else if err == nil {
		t.Fatal("call returned no result")
	}
	if expected, ok := testCase["expectRequest"].(map[string]any); ok {
		if transport.calls != 1 || recorded == nil {
			t.Fatalf("expected 1 request, got %d", transport.calls)
		}
		assertClientRequest(t, clientSpec, expected, transport.originalURL, recorded, recordedBody, call["method"])
	}
}

var lastResult any

func invokeClient(client *Client, call map[string]any) (any, error) {
	lastResult = nil
	method, _ := call["method"].(string)
	args := mapField(call, "args")
	ctx := context.Background()
	switch method {
	case "me":
		result, err := client.Me(ctx)
		lastResult = result
		return result, err
	case "balance":
		result, err := client.Balance(ctx)
		lastResult = result
		return result, err
	case "search":
		result, err := client.Search(ctx, searchFromFixture(mapField(args, "request")))
		lastResult = result
		return result, err
	case "fetch":
		result, err := client.Fetch(ctx, fetchFromFixture(mapField(args, "request")), fetchOptionsFromFixture(mapField(args, "options")))
		lastResult = result
		return result, err
	case "purchases":
		result, err := client.Purchases(ctx, purchaseOptionsFromFixture(mapField(args, "options")))
		lastResult = result
		return result, err
	case "purchase":
		id := int32(numberField(args, "id"))
		result, err := client.Purchase(ctx, id)
		lastResult = result
		return result, err
	default:
		return nil, errors.New("unknown call " + method)
	}
}

func searchFromFixture(request map[string]any) SearchRequest {
	out := SearchRequest{Query: stringField(request, "query")}
	if _, ok := request["maxResults"]; ok {
		value := int32(numberField(request, "maxResults"))
		out.MaxResults = &value
	}
	if filters, ok := request["filters"].(map[string]any); ok {
		out.Filters = filtersFromFixture(filters)
	}
	return out
}

func filtersFromFixture(filters map[string]any) *SearchFilters {
	out := &SearchFilters{}
	if value, ok := filters["price"].(map[string]any); ok {
		out.Price = decimalFromFixture(value)
	}
	if value, ok := filters["priceAtomic"].(map[string]any); ok {
		out.PriceAtomic = decimalFromFixture(value)
	}
	if value, ok := filters["type"].(map[string]any); ok {
		out.Type = eqInFromFixture(value)
	}
	if value, ok := filters["protocol"].(map[string]any); ok {
		out.Protocol = eqInFromFixture(value)
	}
	if value, ok := filters["category"].(map[string]any); ok {
		out.Category = eqInFromFixture(value)
	}
	if value, ok := filters["method"].(map[string]any); ok {
		out.Method = eqInFromFixture(value)
	}
	if value, ok := filters["executionMode"].(map[string]any); ok {
		out.ExecutionMode = eqInFromFixture(value)
	}
	if _, ok := filters["weftFetchCompatible"]; ok {
		value := boolField(filters, "weftFetchCompatible")
		out.WeftFetchCompatible = &value
	}
	if _, ok := filters["includeUnknownPrices"]; ok {
		value := boolField(filters, "includeUnknownPrices")
		out.IncludeUnknownPrices = &value
	}
	return out
}

func decimalFromFixture(value map[string]any) *DecimalFilter {
	out := &DecimalFilter{}
	if text, ok := value["lte"].(string); ok {
		out.LTE = &text
	}
	if text, ok := value["gte"].(string); ok {
		out.GTE = &text
	}
	if text, ok := value["eq"].(string); ok {
		out.EQ = &text
	}
	if text, ok := value["rangeGte"].(string); ok {
		out.RangeGTE = &text
	}
	if text, ok := value["rangeLte"].(string); ok {
		out.RangeLTE = &text
	}
	return out
}

func eqInFromFixture(value map[string]any) *EqInFilter {
	out := &EqInFilter{}
	if text, ok := value["eq"].(string); ok {
		out.EQ = &text
	}
	if list, ok := value["in"].([]any); ok {
		for _, item := range list {
			out.In = append(out.In, item.(string))
		}
	}
	return out
}

func fetchFromFixture(request map[string]any) FetchRequest {
	out := FetchRequest{
		URL:        stringField(request, "url"),
		MaxCostUSD: stringField(request, "maxCostUsd"),
		Method:     stringField(request, "method"),
	}
	if _, ok := request["body"]; ok {
		out.Body = request["body"]
	}
	if headers, ok := request["headers"].(map[string]any); ok {
		out.Headers = map[string]string{}
		for key, value := range headers {
			out.Headers[key] = value.(string)
		}
	}
	out.SearchID = stringField(request, "searchId")
	out.OperationID = stringField(request, "operationId")
	out.AccessMethodID = stringField(request, "accessMethodId")
	return out
}

func fetchOptionsFromFixture(options map[string]any) FetchOptions {
	return FetchOptions{IdempotencyKey: stringField(options, "idempotencyKey")}
}

func purchaseOptionsFromFixture(options map[string]any) PurchaseListOptions {
	out := PurchaseListOptions{}
	if _, ok := options["page"]; ok {
		value := int32(numberField(options, "page"))
		out.Page = &value
	}
	if _, ok := options["perPage"]; ok {
		value := int32(numberField(options, "perPage"))
		out.PerPage = &value
	}
	return out
}

type recordingTransport struct {
	server         *httptest.Server
	networkFailure bool
	calls          int
	originalURL    string
}

func (t *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.calls++
	t.originalURL = req.URL.String()
	if t.networkFailure {
		return nil, errors.New("connection reset")
	}
	clone := req.Clone(req.Context())
	target, err := req.URL.Parse(t.server.URL)
	if err != nil {
		return nil, err
	}
	clone.URL.Scheme = target.Scheme
	clone.URL.Host = target.Host
	clone.Host = target.Host
	if req.Body != nil {
		payload, err := io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
		clone.Body = io.NopCloser(bytes.NewReader(payload))
		clone.ContentLength = int64(len(payload))
	}
	return http.DefaultTransport.RoundTrip(clone)
}

func writeFixtureResponse(w http.ResponseWriter, response map[string]any) {
	headers, _ := response["headers"].(map[string]any)
	for name, value := range headers {
		w.Header().Set(name, value.(string))
	}
	status := 200
	if _, ok := response["status"]; ok {
		status = int(numberField(response, "status"))
	}
	body := response["body"]
	var payload []byte
	switch value := body.(type) {
	case string:
		payload = []byte(value)
	case nil:
		payload = []byte("null")
	default:
		payload, _ = json.Marshal(value)
	}
	w.WriteHeader(status)
	_, _ = w.Write(payload)
}

func assertClientError(t *testing.T, err error, expected map[string]any) {
	t.Helper()
	var got *Error
	if !errors.As(err, &got) {
		t.Fatalf("expected *weft.Error, got %T %v", err, err)
	}
	if got.Status != int(numberField(expected, "status")) {
		t.Fatalf("status %d, want %v", got.Status, expected["status"])
	}
	if got.Code != stringField(expected, "code") {
		t.Fatalf("code %q, want %q", got.Code, expected["code"])
	}
	if got.Message != stringField(expected, "message") {
		t.Fatalf("message %q, want %q", got.Message, expected["message"])
	}
	if expected["requestId"] == nil {
		if got.RequestID != nil {
			t.Fatalf("request id %q, want none", *got.RequestID)
		}
	} else if got.RequestID == nil || *got.RequestID != expected["requestId"] {
		t.Fatalf("request id %v, want %v", got.RequestID, expected["requestId"])
	}
	if got.Retryable != boolField(expected, "retryable") {
		t.Fatalf("retryable %v, want %v", got.Retryable, expected["retryable"])
	}
	if _, ok := expected["details"]; ok {
		if expected["details"] == nil {
			if got.HasDetails() {
				t.Fatalf("details %#v, want none", got.Details)
			}
			return
		}
		if !jsonEqual(got.Details, expected["details"]) {
			t.Fatalf("details %#v, want %#v", got.Details, expected["details"])
		}
	}
}

func assertClientResult(t *testing.T, result any, expected any) {
	t.Helper()
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	var got any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	normalizeWireTimes(got)
	normalizeWireTimes(expected)
	if !reflect.DeepEqual(got, expected) {
		want, _ := json.Marshal(expected)
		t.Fatalf("result %s, want %s", encoded, want)
	}
}

func normalizeWireTimes(value any) {
	switch typed := value.(type) {
	case map[string]any:
		for key, item := range typed {
			if text, ok := item.(string); ok {
				if parsed, err := time.Parse(time.RFC3339Nano, text); err == nil {
					typed[key] = parsed.UTC().Format("2006-01-02T15:04:05.000Z")
				}
			} else {
				normalizeWireTimes(item)
			}
		}
	case []any:
		for _, item := range typed {
			normalizeWireTimes(item)
		}
	}
}

func assertClientRequest(t *testing.T, clientSpec, expected map[string]any, original string, req *http.Request, body []byte, method any) {
	t.Helper()
	base, _ := clientSpec["baseUrl"].(string)
	if _, ok := clientSpec["baseUrl"]; !ok {
		base = defaultBaseURL
	}
	base = strings.TrimRight(base, "/")
	wantURL := base + stringField(expected, "path")
	gotURL := strings.Split(original, "?")[0]
	if gotURL != wantURL {
		t.Fatalf("url %s, want %s", gotURL, wantURL)
	}
	if req.Method != stringField(expected, "method") {
		t.Fatalf("method %s, want %s", req.Method, expected["method"])
	}
	gotQuery := map[string]string{}
	for key, values := range req.URL.Query() {
		gotQuery[key] = values[0]
	}
	wantQuery := map[string]string{}
	if raw, ok := expected["query"].(map[string]any); ok {
		for key, value := range raw {
			wantQuery[key] = value.(string)
		}
	}
	if !reflect.DeepEqual(gotQuery, wantQuery) {
		t.Fatalf("query %#v, want %#v", gotQuery, wantQuery)
	}
	headers, _ := expected["headers"].(map[string]any)
	for name, value := range headers {
		if got := req.Header.Get(name); got != value.(string) {
			t.Fatalf("header %s %q, want %q", name, got, value)
		}
	}
	if method != "fetch" && req.Header.Get("Idempotency-Key") != "" {
		t.Fatalf("unexpected idempotency key %q", req.Header.Get("Idempotency-Key"))
	}
	if _, ok := expected["jsonBody"]; ok {
		var got any
		if err := json.Unmarshal(body, &got); err != nil {
			t.Fatalf("request body %s: %v", body, err)
		}
		if !jsonEqual(got, expected["jsonBody"]) {
			t.Fatalf("json body %s, want %#v", body, expected["jsonBody"])
		}
		return
	}
	if len(bytes.TrimSpace(body)) != 0 {
		t.Fatalf("expected empty body, got %s", body)
	}
}

func jsonEqual(got, want any) bool {
	left, _ := json.Marshal(got)
	right, _ := json.Marshal(want)
	var a, b any
	_ = json.Unmarshal(left, &a)
	_ = json.Unmarshal(right, &b)
	return reflect.DeepEqual(a, b)
}

func mapField(value map[string]any, key string) map[string]any {
	out, _ := value[key].(map[string]any)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func stringField(value map[string]any, key string) string {
	text, _ := value[key].(string)
	return text
}

func boolField(value map[string]any, key string) bool {
	flag, _ := value[key].(bool)
	return flag
}

func numberField(value map[string]any, key string) float64 {
	switch typed := value[key].(type) {
	case float64:
		return typed
	case json.Number:
		number, _ := typed.Float64()
		return number
	default:
		return 0
	}
}
