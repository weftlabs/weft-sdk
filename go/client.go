package weft

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"strings"

	"github.com/weftlabs/weft-sdk/go/generated"
)

const defaultBaseURL = "https://weft.network"

// Options configures the buyer façade. Exactly one of APIKey or AccessToken
// is required. BaseURL defaults to https://weft.network. Trailing slashes are
// stripped. HTTPClient is optional.
type Options struct {
	APIKey      string
	AccessToken string
	BaseURL     string
	HTTPClient  *http.Client
}

// SearchFilters are optional search constraints. A nil field stays off the wire.
type SearchFilters struct {
	Price                *DecimalFilter
	PriceAtomic          *DecimalFilter
	Type                 *EqInFilter
	Protocol             *EqInFilter
	Category             *EqInFilter
	Method               *EqInFilter
	ExecutionMode        *EqInFilter
	WeftFetchCompatible  *bool
	IncludeUnknownPrices *bool
}

// DecimalFilter is a USD or atomic price constraint. Nil operators are omitted.
type DecimalFilter struct {
	LTE      *string
	GTE      *string
	EQ       *string
	RangeGTE *string
	RangeLTE *string
}

// EqInFilter is an equality or membership constraint.
type EqInFilter struct {
	EQ *string
	In []string
}

// SearchRequest is the buyer search call. MaxResults and Filters are omitted
// when unset.
type SearchRequest struct {
	Query      string
	MaxResults *int32
	Filters    *SearchFilters
}

// FetchRequest is a paid fetch. MaxCostUSD is required. Optional fields are
// omitted when empty or nil. An object or array Body is sent as a JSON string
// with the same bytes as JSON.stringify (no HTML escaping).
type FetchRequest struct {
	URL            string
	MaxCostUSD     string
	Method         string
	Body           any
	Headers        map[string]string
	SearchID       string
	OperationID    string
	AccessMethodID string
}

// FetchOptions carries the required idempotency key for a paid fetch.
type FetchOptions struct {
	IdempotencyKey string
}

// PurchaseListOptions selects a purchase page. Nil fields stay off the wire.
type PurchaseListOptions struct {
	Page    *int32
	PerPage *int32
}

// Client is the buyer façade over the generated Weft API.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// NewClient returns a buyer client. It rejects a missing, blank, or doubled
// credential before any request.
func NewClient(options Options) (*Client, error) {
	apiSet := options.APIKey != ""
	tokenSet := options.AccessToken != ""
	if apiSet && tokenSet {
		return nil, validation("apiKey and accessToken are mutually exclusive")
	}
	raw := options.APIKey
	which := "apiKey"
	if tokenSet {
		raw = options.AccessToken
		which = "accessToken"
	}
	if !apiSet && !tokenSet {
		return nil, validation("apiKey or accessToken is required")
	}
	credential := strings.TrimSpace(raw)
	if credential == "" {
		return nil, validation(which + " is required")
	}
	base := options.BaseURL
	if base == "" {
		base = defaultBaseURL
	}
	base = strings.TrimRight(base, "/")
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{baseURL: base, token: credential, http: httpClient}, nil
}

// Me returns the authenticated principal.
func (c *Client) Me(ctx context.Context) (*generated.MeResponse, error) {
	var out generated.MeResponse
	if err := c.call(ctx, http.MethodGet, "/api/v1/me", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Balance returns the wallet snapshot.
func (c *Client) Balance(ctx context.Context) (*generated.BalanceResponse, error) {
	var out generated.BalanceResponse
	if err := c.call(ctx, http.MethodGet, "/api/v1/balance", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Search runs a discovery query. Unset optional fields stay off the wire.
func (c *Client) Search(ctx context.Context, request SearchRequest) (*generated.SearchResponse, error) {
	body, err := marshalJSON(searchWire(request))
	if err != nil {
		return nil, err
	}
	var out generated.SearchResponse
	if err := c.call(ctx, http.MethodPost, "/api/v1/search", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Fetch pays for and executes an upstream call. MaxCostUSD and IdempotencyKey
// are required and are checked before any request.
func (c *Client) Fetch(ctx context.Context, request FetchRequest, options FetchOptions) (*generated.FetchResponse, error) {
	if strings.TrimSpace(request.MaxCostUSD) == "" {
		return nil, validation("maxCostUsd is required")
	}
	if strings.TrimSpace(options.IdempotencyKey) == "" {
		return nil, validation("idempotencyKey is required")
	}
	wire, err := fetchWire(request)
	if err != nil {
		return nil, err
	}
	body, err := marshalJSON(wire)
	if err != nil {
		return nil, err
	}
	headers := map[string]string{"Idempotency-Key": strings.TrimSpace(options.IdempotencyKey)}
	var out generated.FetchResponse
	if err := c.call(ctx, http.MethodPost, "/api/v1/fetch", headers, body, &out); err != nil {
		var weftErr *Error
		if errors.As(err, &weftErr) {
			weftErr.Charge = fetchCharge(weftErr.Status, weftErr.Code)
			return nil, err
		}
		// Weft answered 2xx, so the fetch most likely paid, but the body did not decode.
		return nil, &Error{
			Code:       "RESPONSE_DECODE_ERROR",
			Message:    "Weft API returned a fetch response that could not be decoded",
			Retryable:  true,
			Charge:     ChargePossible,
			Details:    err,
			hasDetails: true,
		}
	}
	return &out, nil
}

// Purchases lists the buyer ledger. Omitted page fields stay off the query string.
func (c *Client) Purchases(ctx context.Context, options PurchaseListOptions) (*generated.PurchaseListResponse, error) {
	query := url.Values{}
	if options.Page != nil {
		query.Set("page", strconv.FormatInt(int64(*options.Page), 10))
	}
	if options.PerPage != nil {
		query.Set("per_page", strconv.FormatInt(int64(*options.PerPage), 10))
	}
	var out generated.PurchaseListResponse
	if err := c.callQuery(ctx, http.MethodGet, "/api/v1/purchases", query, nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Purchase reads one purchase by id.
func (c *Client) Purchase(ctx context.Context, id int32) (*generated.PurchaseResponse, error) {
	var out generated.PurchaseResponse
	path := "/api/v1/purchases/" + strconv.FormatInt(int64(id), 10)
	if err := c.call(ctx, http.MethodGet, path, nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) call(ctx context.Context, method, path string, headers map[string]string, body []byte, dest any) error {
	return c.callQuery(ctx, method, path, nil, headers, body, dest)
}

func (c *Client) callQuery(ctx context.Context, method, path string, query url.Values, headers map[string]string, body []byte, dest any) error {
	if ctx == nil {
		ctx = context.Background()
	}
	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return networkError(err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return networkError(err)
	}
	payload, err := readBody(resp)
	if err != nil {
		return networkError(err)
	}
	if resp.StatusCode >= 300 {
		return normalizeHTTPError(resp, payload)
	}
	if dest == nil || len(payload) == 0 {
		return nil
	}
	if err := json.Unmarshal(payload, dest); err != nil {
		return err
	}
	return nil
}

func searchWire(request SearchRequest) map[string]any {
	wire := map[string]any{"query": request.Query}
	if request.MaxResults != nil {
		wire["max_results"] = *request.MaxResults
	}
	if request.Filters != nil {
		if filters := filtersWire(request.Filters); len(filters) > 0 {
			wire["filters"] = filters
		}
	}
	return wire
}

func filtersWire(filters *SearchFilters) map[string]any {
	wire := map[string]any{}
	if value := decimalWire(filters.Price); value != nil {
		wire["price"] = value
	}
	if value := decimalWire(filters.PriceAtomic); value != nil {
		wire["price_atomic"] = value
	}
	if value := eqInWire(filters.Type); value != nil {
		wire["type"] = value
	}
	if value := eqInWire(filters.Protocol); value != nil {
		wire["protocol"] = value
	}
	if value := eqInWire(filters.Category); value != nil {
		wire["category"] = value
	}
	if value := eqInWire(filters.Method); value != nil {
		wire["method"] = value
	}
	if value := eqInWire(filters.ExecutionMode); value != nil {
		wire["execution_mode"] = value
	}
	if filters.WeftFetchCompatible != nil {
		wire["weft_fetch_compatible"] = *filters.WeftFetchCompatible
	}
	if filters.IncludeUnknownPrices != nil {
		wire["include_unknown_prices"] = *filters.IncludeUnknownPrices
	}
	return wire
}

func decimalWire(filter *DecimalFilter) map[string]any {
	if filter == nil {
		return nil
	}
	wire := map[string]any{}
	if filter.LTE != nil {
		wire["lte"] = *filter.LTE
	}
	if filter.GTE != nil {
		wire["gte"] = *filter.GTE
	}
	if filter.EQ != nil {
		wire["eq"] = *filter.EQ
	}
	if filter.RangeGTE != nil {
		wire["range_gte"] = *filter.RangeGTE
	}
	if filter.RangeLTE != nil {
		wire["range_lte"] = *filter.RangeLTE
	}
	if len(wire) == 0 {
		return nil
	}
	return wire
}

func eqInWire(filter *EqInFilter) map[string]any {
	if filter == nil {
		return nil
	}
	wire := map[string]any{}
	if filter.EQ != nil {
		wire["eq"] = *filter.EQ
	}
	if filter.In != nil {
		wire["in"] = filter.In
	}
	if len(wire) == 0 {
		return nil
	}
	return wire
}

func fetchWire(request FetchRequest) (map[string]any, error) {
	wire := map[string]any{
		"url":          request.URL,
		"max_cost_usd": request.MaxCostUSD,
	}
	if request.Method != "" {
		wire["method"] = request.Method
	}
	if request.Body != nil {
		body, err := fetchBody(request.Body)
		if err != nil {
			return nil, err
		}
		wire["body"] = body
	}
	if request.Headers != nil {
		wire["headers"] = request.Headers
	}
	if request.SearchID != "" {
		wire["search_id"] = request.SearchID
	}
	if request.OperationID != "" {
		wire["operation_id"] = request.OperationID
	}
	if request.AccessMethodID != "" {
		wire["access_method_id"] = request.AccessMethodID
	}
	return wire, nil
}

func fetchBody(value any) (any, error) {
	if text, ok := value.(string); ok {
		return text, nil
	}
	if !isJSONContainer(value) {
		return value, nil
	}
	encoded, err := marshalJSON(value)
	if err != nil {
		return nil, err
	}
	return string(encoded), nil
}

func isJSONContainer(value any) bool {
	if value == nil {
		return false
	}
	if _, ok := value.(json.RawMessage); ok {
		return true
	}
	if _, ok := value.([]byte); ok {
		return false
	}
	switch reflect.TypeOf(value).Kind() {
	case reflect.Map, reflect.Slice, reflect.Array:
		return true
	default:
		return false
	}
}

func marshalJSON(value any) ([]byte, error) {
	normalized, err := normalizeJSONValue(value)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(normalized); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// normalizeJSONValue matches JSON.stringify: NaN and Inf become null.
var errCircularJSON = errors.New("circular JSON")

func normalizeJSONValue(value any) (any, error) {
	return normalizeJSONValueSeen(value, map[uintptr]struct{}{})
}

func normalizeJSONValueSeen(value any, seen map[uintptr]struct{}) (any, error) {
	if value == nil {
		return nil, nil
	}
	switch typed := value.(type) {
	case json.RawMessage, []byte:
		return typed, nil
	}
	rv := reflect.ValueOf(value)
	switch rv.Kind() {
	case reflect.Pointer, reflect.Interface:
		if rv.IsNil() {
			return nil, nil
		}
		return normalizeJSONValueSeen(rv.Elem().Interface(), seen)
	case reflect.Map:
		if rv.IsNil() {
			return nil, nil
		}
		ptr := rv.Pointer()
		if _, ok := seen[ptr]; ok {
			return nil, errCircularJSON
		}
		seen[ptr] = struct{}{}
		defer delete(seen, ptr)
		out := make(map[string]any, rv.Len())
		for _, key := range rv.MapKeys() {
			if key.Kind() != reflect.String {
				return value, nil
			}
			item, err := normalizeJSONValueSeen(rv.MapIndex(key).Interface(), seen)
			if err != nil {
				return nil, err
			}
			out[key.String()] = item
		}
		return out, nil
	case reflect.Slice, reflect.Array:
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return nil, nil
		}
		if rv.Kind() == reflect.Slice && rv.Pointer() != 0 {
			ptr := rv.Pointer()
			if _, ok := seen[ptr]; ok {
				return nil, errCircularJSON
			}
			seen[ptr] = struct{}{}
			defer delete(seen, ptr)
		}
		out := make([]any, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			item, err := normalizeJSONValueSeen(rv.Index(i).Interface(), seen)
			if err != nil {
				return nil, err
			}
			out[i] = item
		}
		return out, nil
	case reflect.Float32, reflect.Float64:
		number := rv.Float()
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return nil, nil
		}
		return number, nil
	default:
		return value, nil
	}
}
