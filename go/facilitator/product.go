package facilitator

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	typeTagPrefix       = "weft:type:"
	productExtensionKey = "weft.product"
	maxTags             = 5
	maxTagChars         = 32
	maxDimensions       = 8
	maxDimensionChars   = 64
	maxServiceNameChars = 32
	maxIconURLChars     = 2048
)

var (
	productTypes   = []string{"api", "agent", "mcp"}
	printableASCII = regexp.MustCompile(`^[\x20-\x7e]+$`)
	dimensionName  = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]*$`)
)

// ProductInfoSchema is the published weft.product info schema.
func ProductInfoSchema() map[string]any {
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type":    "object",
		"properties": map[string]any{
			"kind":          map[string]any{"type": "string", "enum": []any{"api", "agent", "mcp"}},
			"product_id":    map[string]any{"type": "string", "minLength": 1},
			"manifest_hash": map[string]any{"type": "string", "minLength": 1},
		},
		"additionalProperties": false,
	}
}

// ApplyProductIdentity merges a product declaration into every protected route.
// A config with no Weft identity is returned by reference.
func ApplyProductIdentity(routes any, declaration map[string]any) any {
	if routes == nil {
		return routes
	}
	if !hasProductIdentity(declaration) && !hasRouteIdentity(routes) {
		return routes
	}
	sink := createWarn()
	if isSingleRoute(routes) {
		return applyToRoute(routes, declaration, sink)
	}
	routeMap, ok := routes.(map[string]any)
	if !ok {
		return routes
	}
	out := map[string]any{}
	for pattern, route := range routeMap {
		out[pattern] = applyToRoute(route, declaration, sink)
	}
	return out
}

// SanitizeProductIdentity returns the identity the handshake and challenge share.
// It is silent: ApplyProductIdentity already warned.
func SanitizeProductIdentity(identity map[string]any) map[string]any {
	silent := func(string, string) {}
	kind := resolveType(identity["type"], "type", silent)
	name := resolveServiceName(nil, identity["name"], silent)
	icon := resolveIconURL(nil, identity["iconUrl"], silent)
	tags := resolveTags(nil, identity["tags"], kind, silent)
	var kept []string
	for _, tag := range tags {
		if !isReservedTypeTag(tag) {
			kept = append(kept, tag)
		}
	}
	out := map[string]any{}
	if name != "" {
		out["name"] = name
	}
	if kind != "" {
		out["type"] = kind
	}
	if len(kept) > 0 {
		out["tags"] = kept
	}
	if icon != "" {
		out["iconUrl"] = icon
	}
	return out
}

// ResolveDimensions clamps declared analytics dimension names.
func ResolveDimensions(value any, sink Warn) []string {
	if sink == nil {
		sink = func(string, string) {}
	}
	declared, present := usableTags(value, "dimensions", sink)
	if !present {
		return nil
	}
	var malformed []string
	var named []string
	for _, name := range declared {
		if utf8.RuneCountInString(name) <= maxDimensionChars && dimensionName.MatchString(name) {
			named = append(named, name)
			continue
		}
		malformed = append(malformed, name)
	}
	if len(malformed) > 0 {
		sink(fmt.Sprintf("dropping %d dimension(s) that do not name a field (max %d characters, starting with a letter or underscore): %s", len(malformed), maxDimensionChars, strings.Join(malformed, ", ")), "")
	}
	deduped := dedupe(named)
	if len(deduped) > maxDimensions {
		sink(fmt.Sprintf("dropping %d dimension(s): at most %d travel. Dropped: %s", len(deduped)-maxDimensions, maxDimensions, strings.Join(deduped[maxDimensions:], ", ")), "")
	}
	if len(deduped) > maxDimensions {
		deduped = deduped[:maxDimensions]
	}
	if len(deduped) == 0 {
		return nil
	}
	return deduped
}

func hasProductIdentity(identity map[string]any) bool {
	if identity == nil {
		return false
	}
	for _, key := range []string{"name", "type", "tags", "iconUrl", "productId", "manifestHash"} {
		if isDeclared(identity[key]) {
			return true
		}
	}
	return false
}

func hasRouteIdentity(routes any) bool {
	if isSingleRoute(routes) {
		route, _ := routes.(map[string]any)
		return isDeclared(route["type"])
	}
	routeMap, ok := routes.(map[string]any)
	if !ok {
		return false
	}
	for _, route := range routeMap {
		item, _ := route.(map[string]any)
		if item != nil && isDeclared(item["type"]) {
			return true
		}
	}
	return false
}

func isSingleRoute(routes any) bool {
	route, ok := routes.(map[string]any)
	if !ok {
		return false
	}
	_, ok = route["accepts"]
	return ok
}

func isDeclared(value any) bool {
	return value != nil
}

func applyToRoute(route any, identity map[string]any, sink Warn) any {
	item, ok := route.(map[string]any)
	if !ok || item == nil {
		sink(fmt.Sprintf("ignoring route %s: expected a route config object, got %s", show(route), typeName(route)), "")
		return route
	}
	rest := map[string]any{}
	for key, value := range item {
		switch key {
		case "type", "serviceName", "tags", "iconUrl":
			continue
		default:
			rest[key] = value
		}
	}
	kind := resolveType(item["type"], "route type", sink)
	if kind == "" {
		kind = resolveType(identity["type"], "type", sink)
	}
	serviceName := resolveServiceName(item["serviceName"], identity["name"], sink)
	icon := resolveIconURL(item["iconUrl"], identity["iconUrl"], sink)
	tags := resolveTags(item["tags"], identity["tags"], kind, sink)
	extensions := resolveProductExtensions(rest["extensions"], kind, identity, sink)
	if serviceName != "" {
		rest["serviceName"] = serviceName
	}
	if tags != nil {
		rest["tags"] = tags
	}
	if icon != "" {
		rest["iconUrl"] = icon
	}
	if extensions != nil {
		rest["extensions"] = extensions
	}
	return rest
}

func resolveType(value any, field string, sink Warn) string {
	if !isDeclared(value) {
		return ""
	}
	text, ok := value.(string)
	if !ok || !contains(productTypes, text) {
		sink(fmt.Sprintf("ignoring %s %s: expected one of %s", field, show(value), strings.Join(productTypes, ", ")), "")
		return ""
	}
	return text
}

func resolveServiceName(routeName, identityName any, sink Warn) string {
	declared, present := usableString(routeName, "route serviceName", sink)
	if !present {
		declared, _ = usableString(identityName, "name", sink)
	}
	if declared == "" {
		return ""
	}
	if !printableASCII.MatchString(declared) {
		sink(fmt.Sprintf("dropping product name %s: the x402 protocol carries 1-%d printable-ASCII characters (U+0020-U+007E)", show(declared), maxServiceNameChars), "")
		return ""
	}
	if utf8.RuneCountInString(declared) > maxServiceNameChars {
		truncated := truncateRunes(declared, maxServiceNameChars)
		sink(fmt.Sprintf("product name %s is %d characters; the x402 protocol carries %d, so it travels as %s", show(declared), utf8.RuneCountInString(declared), maxServiceNameChars, show(truncated)), "")
		return truncated
	}
	return declared
}

func resolveIconURL(routeIcon, identityIcon any, sink Warn) string {
	declared, present := usableString(routeIcon, "route iconUrl", sink)
	if !present {
		declared, _ = usableString(identityIcon, "iconUrl", sink)
	}
	if declared == "" {
		return ""
	}
	if utf8.RuneCountInString(declared) > maxIconURLChars {
		sink(fmt.Sprintf("dropping iconUrl: %d characters exceeds the %d the x402 protocol carries", utf8.RuneCountInString(declared), maxIconURLChars), "")
		return ""
	}
	parsed, err := url.Parse(declared)
	if err != nil || parsed.Scheme == "" || !parsed.IsAbs() {
		sink(fmt.Sprintf("dropping iconUrl %s: expected an absolute http or https URL", show(declared)), "")
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		sink(fmt.Sprintf("dropping iconUrl %s: only http and https are carried (a dashboard renders this URL)", show(declared)), "")
		return ""
	}
	return declared
}

func resolveTags(routeTags, identityTags any, kind string, sink Warn) []string {
	declared, present := usableTags(routeTags, "route tags", sink)
	if !present {
		declared, _ = usableTags(identityTags, "tags", sink)
	}
	if declared == nil && kind == "" {
		return nil
	}
	var seller []string
	for _, tag := range declared {
		if !isReservedTypeTag(tag) {
			seller = append(seller, tag)
			continue
		}
		sink(fmt.Sprintf("dropping reserved tag %s: declare the product kind with `type` (%s) on the middleware config or on the route", show(tag), strings.Join(productTypes, ", ")), "")
	}
	var carried []string
	if kind != "" {
		carried = append(carried, typeTagPrefix+kind)
	}
	carried = append(carried, seller...)
	var malformed []string
	var kept []string
	for _, tag := range carried {
		if utf8.RuneCountInString(tag) <= maxTagChars && printableASCII.MatchString(tag) {
			kept = append(kept, tag)
			continue
		}
		malformed = append(malformed, tag)
	}
	if len(malformed) > 0 {
		sink(fmt.Sprintf("dropping %d tag(s) the x402 protocol cannot carry (max %d printable-ASCII characters each): %s", len(malformed), maxTagChars, strings.Join(malformed, ", ")), "")
	}
	deduped := dedupe(kept)
	if len(deduped) > maxTags {
		dropped := deduped[maxTags:]
		extra := ""
		if kind != "" {
			extra = " and the declared type uses one of them"
		}
		sink(fmt.Sprintf("dropping %d tag(s): the x402 protocol carries %d%s. Dropped: %s", len(dropped), maxTags, extra, strings.Join(dropped, ", ")), "")
		deduped = deduped[:maxTags]
	}
	if len(deduped) == 0 {
		return nil
	}
	return deduped
}

func resolveProductExtensions(routeExtensions any, kind string, declaration map[string]any, sink Warn) any {
	productID := resolveOpaqueString("productId", declaration["productId"], sink)
	manifest := resolveOpaqueString("manifestHash", declaration["manifestHash"], sink)
	info := map[string]any{}
	if kind != "" {
		info["kind"] = kind
	}
	if productID != "" {
		info["product_id"] = productID
	}
	if manifest != "" {
		info["manifest_hash"] = manifest
	}
	if len(info) == 0 {
		return nil
	}
	if isDeclared(routeExtensions) {
		ext, ok := routeExtensions.(map[string]any)
		if !ok {
			sink(fmt.Sprintf("route extensions %s are %s, not an object; leaving them untouched and skipping the %s declaration for this route", show(routeExtensions), typeName(routeExtensions), productExtensionKey), "")
			return nil
		}
		if _, exists := ext[productExtensionKey]; exists {
			return nil
		}
		out := map[string]any{}
		for key, value := range ext {
			out[key] = value
		}
		out[productExtensionKey] = map[string]any{"info": info, "schema": ProductInfoSchema()}
		return out
	}
	return map[string]any{
		productExtensionKey: map[string]any{"info": info, "schema": ProductInfoSchema()},
	}
}

func resolveOpaqueString(field string, value any, sink Warn) string {
	declared, _ := usableString(value, field, sink)
	if declared == "" {
		return ""
	}
	trimmed := strings.TrimSpace(declared)
	if trimmed == "" {
		sink("ignoring empty "+field, "")
		return ""
	}
	return trimmed
}

func usableString(value any, field string, sink Warn) (string, bool) {
	if !isDeclared(value) {
		return "", false
	}
	text, ok := value.(string)
	if !ok {
		sink(fmt.Sprintf("ignoring %s %s: expected a string, got %s", field, show(value), typeName(value)), "")
		return "", false
	}
	return text, true
}

func usableTags(value any, field string, sink Warn) ([]string, bool) {
	if !isDeclared(value) {
		return nil, false
	}
	if typed, ok := value.([]string); ok {
		return append([]string{}, typed...), true
	}
	list, ok := value.([]any)
	if !ok {
		sink(fmt.Sprintf("ignoring %s %s: expected an array of strings, got %s", field, show(value), typeName(value)), "")
		return nil, false
	}
	var out []string
	for _, entry := range list {
		text, ok := entry.(string)
		if !ok {
			sink(fmt.Sprintf("dropping tag %s: expected a string, got %s", show(entry), typeName(entry)), "")
			continue
		}
		out = append(out, text)
	}
	return out, true
}

func isReservedTypeTag(tag string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(tag)), typeTagPrefix)
}

func isString(value any) bool {
	_, ok := value.(string)
	return ok
}

func contains(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

func dedupe(values []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func truncateRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	count := 0
	for index := range value {
		if count == limit {
			return value[:index]
		}
		count++
	}
	return value
}

func typeName(value any) string {
	if value == nil {
		return "null"
	}
	switch value.(type) {
	case []any, []string:
		return "an array"
	case string:
		return "a string"
	case float64, float32, int, int32, int64, json.Number:
		return "a number"
	case bool:
		return "a boolean"
	default:
		return "a object"
	}
}

func show(value any) string {
	encoded, err := marshalNoHTML(value)
	if err != nil {
		return typeName(value)
	}
	if string(encoded) == "null" && value == nil {
		return "null"
	}
	return string(encoded)
}
