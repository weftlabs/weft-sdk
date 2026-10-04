package facilitator

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

const (
	paymentRequiredHeader  = "PAYMENT-REQUIRED"
	paymentResponseHeader  = "PAYMENT-RESPONSE"
	paymentSignatureHeader = "PAYMENT-SIGNATURE"
	paymentRequiredCache   = "no-store"
	settlementOverrides    = "Settlement-Overrides"
)

type paymentOption struct {
	Scheme            string
	Network           string
	PayTo             string
	Price             string
	MaxTimeoutSeconds int
	Extra             map[string]any
}

// FlowSupport is the payment flows one asset-transfer method can run.
// upfront and escrow settle before the handler. This middleware refuses them.
type FlowSupport struct {
	Supported []string
	Default   string
}

// Scheme parses a route price into wire amount and asset.
type Scheme struct {
	Name                       string
	Network                    string
	DefaultAssetTransferMethod string
	ParsePrice                 func(price string) (amount string, asset string, extra map[string]any, err error)
	// AssetDecimals converts a dollar settlement override. Unknown decimals fail the settlement.
	AssetDecimals func(asset, network string) (int, bool)
	// PaymentFlows declares supported flows. A before-handler flow is a construction error.
	PaymentFlows map[string]FlowSupport
}

func encodePaymentRequired(value any) (string, error) {
	encoded, err := marshalNoHTML(value)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(encoded), nil
}

func decodePaymentHeader(value string) (map[string]any, error) {
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func requestResourceURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "localhost"
	}
	return scheme + "://" + host + r.URL.Path
}

type compiledRoute struct {
	verb    string
	regex   *regexp.Regexp
	pattern string
	config  map[string]any
}

func compileRoutes(routes map[string]any) ([]compiledRoute, error) {
	var out []compiledRoute
	for pattern, config := range routes {
		item, _ := config.(map[string]any)
		verb, re, err := compilePattern(pattern)
		if err != nil {
			return nil, err
		}
		out = append(out, compiledRoute{
			verb:    verb,
			regex:   re,
			pattern: pattern,
			config:  item,
		})
	}
	return out, nil
}

func compilePattern(pattern string) (string, *regexp.Regexp, error) {
	if strings.ContainsAny(pattern, "{}") {
		return "", nil, fmt.Errorf("unknown route pattern %q: {name} is not an x402 parameter; use :name or [name]", pattern)
	}
	verb, path := "*", pattern
	if strings.Contains(pattern, " ") {
		parts := strings.Fields(pattern)
		verb = strings.ToUpper(parts[0])
		if len(parts) > 1 {
			path = parts[1]
		} else {
			path = ""
		}
	}
	trailing := strings.HasSuffix(path, "/*")
	body := path
	if trailing {
		body = strings.TrimSuffix(path, "/*")
	}
	regexBody := pathRegex(body)
	if trailing {
		regexBody += "(?:/.*?)?"
	}
	re, err := regexp.Compile("(?is)^" + regexBody + "$")
	if err != nil {
		return "", nil, fmt.Errorf("route pattern %q: %w", pattern, err)
	}
	return verb, re, nil
}

func pathRegex(path string) string {
	var b strings.Builder
	for i := 0; i < len(path); {
		switch path[i] {
		case '\\':
			b.WriteString(`\`)
			i++
		case '*':
			b.WriteString(`.*?`)
			i++
		case '[':
			end := strings.IndexByte(path[i:], ']')
			if end > 1 {
				b.WriteString(`[^/]+`)
				i += end + 1
				continue
			}
			b.WriteByte('[')
			i++
		case ':':
			if nameLen := identLen(path[i+1:]); nameLen > 0 {
				b.WriteString(`[^/]+`)
				i += 1 + nameLen
				continue
			}
			b.WriteByte(':')
			i++
		default:
			if strings.ContainsRune(`$()+.?^{|}`, rune(path[i])) {
				b.WriteByte('\\')
			}
			b.WriteByte(path[i])
			i++
		}
	}
	return b.String()
}

func identLen(value string) int {
	if value == "" || !isIdentStart(value[0]) {
		return 0
	}
	for i := 1; i < len(value); i++ {
		if !isIdentCont(value[i]) {
			return i
		}
	}
	return len(value)
}

func isIdentStart(b byte) bool {
	return b == '_' || (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z')
}

func isIdentCont(b byte) bool {
	return isIdentStart(b) || (b >= '0' && b <= '9')
}

func matchRoute(routes []compiledRoute, method, path string) *compiledRoute {
	normalized := normalizePath(path)
	upper := strings.ToUpper(method)
	for i := range routes {
		route := &routes[i]
		if route.verb != "*" && route.verb != upper {
			continue
		}
		if route.regex.MatchString(normalized) {
			return route
		}
	}
	return nil
}

func normalizePath(path string) string {
	path = strings.SplitN(path, "?", 2)[0]
	path = strings.SplitN(path, "#", 2)[0]
	for strings.Contains(path, "//") {
		path = strings.ReplaceAll(path, "//", "/")
	}
	if len(path) > 1 {
		path = strings.TrimRight(path, "/")
	}
	return path
}

func paymentHeader(r *http.Request) string {
	if value := r.Header.Get(paymentSignatureHeader); value != "" {
		return value
	}
	return r.Header.Get("X-Payment")
}

func withPrivateCacheControl(value string) string {
	if strings.TrimSpace(value) == "" {
		return "private"
	}
	for _, directive := range strings.Split(value, ",") {
		if strings.EqualFold(strings.TrimSpace(directive), "private") {
			return value
		}
	}
	return value + ", private"
}

func writeFacilitatorUnavailable(w http.ResponseWriter) {
	w.Header().Del(paymentResponseHeader)
	w.Header().Del(settlementOverrides)
	w.Header().Set("Retry-After", "1")
	w.Header().Set("Cache-Control", withPrivateCacheControl(""))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`{"error":"facilitator_unavailable"}`))
}
