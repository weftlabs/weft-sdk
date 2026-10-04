// Package facilitator is the net/http seller middleware.
//
// github.com/coinbase/x402/go resolves to module github.com/x402-foundation/x402/go
// and requires Go 1.24. This module stays on Go 1.23, so the v2 challenge,
// verify, and settle wire behaviour lives here instead of that dependency.
package facilitator

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const syncRetryFloor = 30 * time.Second

// nowFunc is the clock for facilitator re-sync. Tests replace it.
var nowFunc = time.Now

// RouteConfig is one protected route. Type is consumed into the reserved tag
// and is not forwarded. Extension values may be static objects or callbacks.
type RouteConfig struct {
	Accepts     any
	Description string
	MimeType    string
	ServiceName string
	Tags        []string
	IconURL     string
	Type        string
	Extensions  map[string]any
	Resource    string
}

// RequestExtension builds one extension value for the current request.
type RequestExtension func(*http.Request) (any, error)

// ResumeVerifiedPayment restores a previously verified payment. The caller
// must bind the result to the signed payload. The SDK does not authenticate it.
type ResumeVerifiedPayment func(*http.Request, map[string]any) (map[string]any, bool)

// MiddlewareConfig is the net/http seller middleware configuration.
type MiddlewareConfig struct {
	APIKey            string
	APIKeySet         bool
	Facilitator       *Config
	Schemes           []Scheme
	SyncOnStart       *bool
	Resume            ResumeVerifiedPayment
	CreateAuthHeaders func() (map[string]any, error)
	Name              string
	Type              string
	Tags              []string
	IconURL           string
	ProductID         string
	ManifestHash      string
	Dimensions        []string
}

// PaymentMiddleware returns net/http seller middleware. The adapter name is nethttp.
func PaymentMiddleware(routes map[string]RouteConfig, cfg MiddlewareConfig) func(http.Handler) http.Handler {
	declaration := declarationMap(cfg)
	identityRoutes := routesToAny(routes)
	applied := ApplyProductIdentity(identityRoutes, declaration)
	appliedMap, _ := applied.(map[string]any)
	if appliedMap == nil {
		appliedMap = map[string]any{}
	}
	compiled := compileRoutes(appliedMap)
	client, err := NewFacilitatorClient(facilitatorConfig(cfg, declaration))
	if err != nil {
		client = &HTTPFacilitatorClient{url: DefaultURL, httpClient: http.DefaultClient}
	}
	syncOnStart := true
	if cfg.SyncOnStart != nil {
		syncOnStart = *cfg.SyncOnStart
	}
	gate := &paymentGate{
		routes:      compiled,
		client:      client,
		schemes:     cfg.Schemes,
		syncOnStart: syncOnStart,
		resume:      cfg.Resume,
		initErr:     err,
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gate.serve(w, r, next)
		})
	}
}

type paymentGate struct {
	routes      []compiledRoute
	client      *HTTPFacilitatorClient
	schemes     []Scheme
	syncOnStart bool
	resume      ResumeVerifiedPayment
	initErr     error

	mu       sync.Mutex
	synced   bool
	syncing  bool
	lastFail time.Time
	booted   bool
}

func (g *paymentGate) serve(w http.ResponseWriter, r *http.Request, next http.Handler) {
	matched := matchRoute(g.routes, r.Method, r.URL.Path)
	if matched == nil {
		next.ServeHTTP(w, r)
		return
	}
	g.ensureSync(r.Context())
	extensions := resolveExtensions(matched.config["extensions"], r)
	requirements, err := g.requirements(matched.config, r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	resource := resourceInfo(matched.config, r)
	header := paymentHeader(r)
	if header == "" {
		writePaymentRequired(w, resource, requirements, extensions, "Payment required")
		return
	}
	payload, err := decodePaymentHeader(header)
	if err != nil || !matchingPayload(payload, requirements) {
		writePaymentRequired(w, resource, requirements, extensions, "No matching payment requirements")
		return
	}
	if resumed, ok := g.resumePayment(r, payload); ok {
		payload = resumed
	} else if !g.verify(r.Context(), payload, requirements[0]) {
		writePaymentRequired(w, resource, requirements, extensions, "Payment verification failed")
		return
	}
	buffered := &bufferedResponse{header: make(http.Header), code: http.StatusOK}
	next.ServeHTTP(buffered, r)
	if buffered.code >= 400 {
		buffered.flush(w, nil)
		return
	}
	settled, err := g.settle(r.Context(), payload, requirements[0], r.Method)
	if err != nil {
		if IsFacilitatorUnavailable(err.Error()) {
			writeFacilitatorUnavailable(w)
			return
		}
		writePaymentRequired(w, resource, requirements, extensions, err.Error())
		return
	}
	extra := map[string]string{}
	if settled != nil {
		encoded, encErr := encodePaymentRequired(settled)
		if encErr == nil {
			extra[paymentResponseHeader] = encoded
		}
	}
	existing := buffered.header.Get("Cache-Control")
	extra["Cache-Control"] = withPrivateCacheControl(existing)
	buffered.header.Del(settlementOverrides)
	buffered.flush(w, extra)
}

func (g *paymentGate) ensureSync(ctx context.Context) {
	if !g.syncOnStart || g.client == nil {
		return
	}
	g.mu.Lock()
	if !g.booted {
		g.booted = true
		g.mu.Unlock()
		g.sync(ctx)
		return
	}
	shouldRetry := !g.synced && !g.syncing && nowFunc().Sub(g.lastFail) >= syncRetryFloor
	g.mu.Unlock()
	if shouldRetry {
		go g.sync(context.Background())
	}
}

func (g *paymentGate) sync(ctx context.Context) {
	g.mu.Lock()
	if g.syncing {
		g.mu.Unlock()
		return
	}
	g.syncing = true
	g.mu.Unlock()
	_, err := g.client.GetSupported(ctx)
	g.mu.Lock()
	g.syncing = false
	if err != nil {
		g.lastFail = nowFunc()
		g.mu.Unlock()
		warn("facilitator sync failed; payment-protected routes degrade until a later attempt succeeds: " + err.Error())
		return
	}
	g.synced = true
	g.mu.Unlock()
}

func (g *paymentGate) verify(ctx context.Context, payload map[string]any, requirements map[string]any) bool {
	resp, err := g.client.Verify(ctx, payload, requirements)
	return err == nil && resp != nil && resp.Valid
}

func (g *paymentGate) settle(ctx context.Context, payload, requirements map[string]any, method string) (map[string]any, error) {
	paid := map[string]any{}
	for key, value := range payload {
		paid[key] = value
	}
	if method != "" {
		paid["httpMethod"] = strings.ToUpper(method)
	}
	resp, err := g.client.Settle(ctx, paid, requirements)
	if err != nil {
		return nil, err
	}
	if resp == nil || !resp.Success {
		reason := ""
		if resp != nil {
			reason = resp.ErrorReason
		}
		if reason == "" {
			reason = "Settlement failed"
		}
		return nil, fmt.Errorf("%s", reason)
	}
	return map[string]any{
		"success":     resp.Success,
		"transaction": resp.TxHash,
		"network":     resp.Network,
	}, nil
}

func (g *paymentGate) resumePayment(r *http.Request, payload map[string]any) (map[string]any, bool) {
	if g.resume == nil || payload == nil {
		return nil, false
	}
	version, _ := payload["x402Version"].(float64)
	if int(version) != 2 {
		return nil, false
	}
	if _, ok := payload["accepted"]; !ok {
		return nil, false
	}
	return g.resume(r, payload)
}

func (g *paymentGate) requirements(config map[string]any, r *http.Request) ([]map[string]any, error) {
	options := normalizeOptions(config["accepts"])
	var out []map[string]any
	for _, option := range options {
		scheme := findScheme(g.schemes, option.Scheme, option.Network)
		if scheme == nil || scheme.ParsePrice == nil {
			return nil, fmt.Errorf("no scheme implementation registered for %s on %s", option.Scheme, option.Network)
		}
		amount, asset, extra, err := scheme.ParsePrice(option.Price)
		if err != nil {
			return nil, err
		}
		if extra == nil {
			extra = map[string]any{}
		}
		for key, value := range option.Extra {
			extra[key] = value
		}
		timeout := option.MaxTimeoutSeconds
		if timeout == 0 {
			timeout = 300
		}
		out = append(out, map[string]any{
			"scheme":            option.Scheme,
			"network":           option.Network,
			"amount":            amount,
			"asset":             asset,
			"payTo":             option.PayTo,
			"maxTimeoutSeconds": timeout,
			"extra":             extra,
		})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("route has no payment options")
	}
	return out, nil
}

func writePaymentRequired(w http.ResponseWriter, resource map[string]any, accepts []map[string]any, extensions map[string]any, reason string) {
	body := map[string]any{
		"x402Version": 2,
		"resource":    resource,
		"accepts":     accepts,
	}
	if reason != "" {
		body["error"] = reason
	}
	if len(extensions) > 0 {
		body["extensions"] = extensions
	}
	encoded, err := encodePaymentRequired(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set(paymentRequiredHeader, encoded)
	w.Header().Set("Cache-Control", paymentRequiredCache)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusPaymentRequired)
	_, _ = w.Write([]byte("{}"))
}

func resourceInfo(config map[string]any, r *http.Request) map[string]any {
	url := requestResourceURL(r)
	if value, ok := config["resource"].(string); ok && value != "" {
		url = value
	}
	info := map[string]any{
		"url":         url,
		"description": stringOr(config["description"]),
		"mimeType":    stringOr(config["mimeType"]),
	}
	if name, ok := config["serviceName"].(string); ok && name != "" {
		info["serviceName"] = name
	}
	if icon, ok := config["iconUrl"].(string); ok && icon != "" {
		info["iconUrl"] = icon
	}
	if tags, ok := config["tags"].([]string); ok && len(tags) > 0 {
		info["tags"] = tags
	}
	if tags, ok := config["tags"].([]any); ok && len(tags) > 0 {
		info["tags"] = tags
	}
	return info
}

func resolveExtensions(value any, r *http.Request) map[string]any {
	source, _ := value.(map[string]any)
	if source == nil {
		return nil
	}
	out := map[string]any{}
	for key, item := range source {
		out[key] = item
	}
	sink := createWarn()
	for key, item := range source {
		call, ok := requestExtension(item, r)
		if !ok {
			continue
		}
		shipped := EnrichDynamicExtension(key, call, out, true, sink)
		if shipped != nil {
			out[key] = shipped
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func requestExtension(value any, r *http.Request) (DynamicExtension, bool) {
	switch fn := value.(type) {
	case RequestExtension:
		return func() (any, error) { return fn(r) }, true
	case func(*http.Request) (any, error):
		return func() (any, error) { return fn(r) }, true
	case func(*http.Request) any:
		return func() (any, error) { return fn(r), nil }, true
	default:
		return asDynamic(value)
	}
}

func matchingPayload(payload map[string]any, requirements []map[string]any) bool {
	if payload == nil {
		return false
	}
	version, _ := payload["x402Version"].(float64)
	if int(version) != 2 {
		return false
	}
	accepted, _ := payload["accepted"].(map[string]any)
	if accepted == nil {
		return false
	}
	for _, requirement := range requirements {
		if requirement["scheme"] == accepted["scheme"] && requirement["network"] == accepted["network"] {
			return true
		}
	}
	return false
}

func normalizeOptions(value any) []paymentOption {
	switch typed := value.(type) {
	case paymentOption:
		return []paymentOption{typed}
	case []paymentOption:
		return typed
	case map[string]any:
		return []paymentOption{optionFromMap(typed)}
	case []any:
		var out []paymentOption
		for _, item := range typed {
			if mapped, ok := item.(map[string]any); ok {
				out = append(out, optionFromMap(mapped))
			}
		}
		return out
	default:
		return nil
	}
}

func optionFromMap(value map[string]any) paymentOption {
	timeout := 0
	switch typed := value["maxTimeoutSeconds"].(type) {
	case float64:
		timeout = int(typed)
	case int:
		timeout = typed
	}
	extra, _ := value["extra"].(map[string]any)
	return paymentOption{
		Scheme:            stringOr(value["scheme"]),
		Network:           stringOr(value["network"]),
		PayTo:             stringOr(value["payTo"]),
		Price:             stringOr(value["price"]),
		MaxTimeoutSeconds: timeout,
		Extra:             extra,
	}
}

func findScheme(schemes []Scheme, name, network string) *Scheme {
	for i := range schemes {
		if schemes[i].Name == name && (schemes[i].Network == "" || schemes[i].Network == network) {
			return &schemes[i]
		}
	}
	return nil
}

func routesToAny(routes map[string]RouteConfig) map[string]any {
	out := map[string]any{}
	for pattern, route := range routes {
		item := map[string]any{"accepts": acceptsToAny(route.Accepts)}
		if route.Description != "" {
			item["description"] = route.Description
		}
		if route.MimeType != "" {
			item["mimeType"] = route.MimeType
		}
		if route.ServiceName != "" {
			item["serviceName"] = route.ServiceName
		}
		if route.IconURL != "" {
			item["iconUrl"] = route.IconURL
		}
		if route.Type != "" {
			item["type"] = route.Type
		}
		if route.Resource != "" {
			item["resource"] = route.Resource
		}
		if len(route.Tags) > 0 {
			item["tags"] = route.Tags
		}
		if route.Extensions != nil {
			item["extensions"] = route.Extensions
		}
		out[pattern] = item
	}
	return out
}

func acceptsToAny(value any) any {
	switch typed := value.(type) {
	case paymentOption:
		return optionToMap(typed)
	case []paymentOption:
		var out []any
		for _, option := range typed {
			out = append(out, optionToMap(option))
		}
		return out
	default:
		return value
	}
}

func optionToMap(option paymentOption) map[string]any {
	out := map[string]any{
		"scheme":  option.Scheme,
		"network": option.Network,
		"payTo":   option.PayTo,
		"price":   option.Price,
	}
	if option.MaxTimeoutSeconds != 0 {
		out["maxTimeoutSeconds"] = option.MaxTimeoutSeconds
	}
	if option.Extra != nil {
		out["extra"] = option.Extra
	}
	return out
}

func declarationMap(cfg MiddlewareConfig) map[string]any {
	out := map[string]any{}
	if cfg.Name != "" {
		out["name"] = cfg.Name
	}
	if cfg.Type != "" {
		out["type"] = cfg.Type
	}
	if len(cfg.Tags) > 0 {
		tags := make([]any, len(cfg.Tags))
		for i, tag := range cfg.Tags {
			tags[i] = tag
		}
		out["tags"] = tags
	}
	if cfg.IconURL != "" {
		out["iconUrl"] = cfg.IconURL
	}
	if cfg.ProductID != "" {
		out["productId"] = cfg.ProductID
	}
	if cfg.ManifestHash != "" {
		out["manifestHash"] = cfg.ManifestHash
	}
	if len(cfg.Dimensions) > 0 {
		dims := make([]any, len(cfg.Dimensions))
		for i, dimension := range cfg.Dimensions {
			dims[i] = dimension
		}
		out["dimensions"] = dims
	}
	return out
}

func facilitatorConfig(cfg MiddlewareConfig, declaration map[string]any) *Config {
	base := cfg.Facilitator
	if base == nil {
		base = &Config{}
	}
	derived := BuildFacilitatorAuthHeaders(AdapterName, cfg.APIKey, cfg.APIKeySet || cfg.APIKey != "", declaration)
	copied := *base
	seller := cfg.CreateAuthHeaders
	copied.Auth = func(path string) (map[string]string, error) {
		var sellerHeaders map[string]any
		if seller != nil {
			var err error
			sellerHeaders, err = seller()
			if err != nil {
				return nil, err
			}
			if err := AssertPathKeyedAuthHeaders(sellerHeaders); err != nil {
				return nil, err
			}
		}
		selected := derived.Supported
		switch path {
		case "settle":
			selected = derived.Settle
		case "verify":
			selected = derived.Verify
		}
		var sellerPath map[string]string
		if raw, ok := sellerHeaders[path].(map[string]any); ok {
			sellerPath = stringMap(raw)
		}
		if raw, ok := sellerHeaders[path].(map[string]string); ok {
			sellerPath = raw
		}
		return MergeSellerWins(selected, sellerPath), nil
	}
	return &copied
}

func stringMap(value map[string]any) map[string]string {
	out := map[string]string{}
	for key, item := range value {
		if text, ok := item.(string); ok {
			out[key] = text
		}
	}
	return out
}

func stringOr(value any) string {
	text, _ := value.(string)
	return text
}

type bufferedResponse struct {
	header http.Header
	code   int
	body   bytes.Buffer
	wrote  bool
}

func (b *bufferedResponse) Header() http.Header { return b.header }

func (b *bufferedResponse) WriteHeader(code int) {
	if b.wrote {
		return
	}
	b.code = code
	b.wrote = true
}

func (b *bufferedResponse) Write(p []byte) (int, error) {
	if !b.wrote {
		b.WriteHeader(http.StatusOK)
	}
	return b.body.Write(p)
}

func (b *bufferedResponse) flush(w http.ResponseWriter, extra map[string]string) {
	for name, values := range b.header {
		for _, value := range values {
			w.Header().Add(name, value)
		}
	}
	for name, value := range extra {
		w.Header().Set(name, value)
	}
	code := b.code
	if code == 0 {
		code = http.StatusOK
	}
	w.WriteHeader(code)
	_, _ = w.Write(b.body.Bytes())
}
