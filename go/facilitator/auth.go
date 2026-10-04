package facilitator

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

const (
	// SDKVersion is the shared SDK version carried in the facilitator User-Agent.
	SDKVersion = "0.29.0"
	// AdapterName identifies this net/http seller middleware.
	AdapterName = "nethttp"
	// DeclaredHeader carries the seller product declaration on /supported.
	DeclaredHeader = "X-Weft-Declared"
	// APIKeyHeader is the seller credential on /verify and /settle.
	APIKeyHeader = "X-API-Key"
	// FacilitatorUnavailableError is the settlement failure token for a down facilitator.
	FacilitatorUnavailableError = "weft:facilitator-settle-unavailable"
)

var headerSafe = regexp.MustCompile(`^[\x21-\x7e]+$`)

// AuthHeaders are path-keyed facilitator headers. Settle and Verify are nil
// when no usable API key was configured.
type AuthHeaders struct {
	Supported map[string]string
	Settle    map[string]string
	Verify    map[string]string
}

// BuildFacilitatorAuthHeaders derives the headers for one adapter. A junk key
// is dropped with one warning and is never logged.
func BuildFacilitatorAuthHeaders(adapter string, apiKey any, apiKeySet bool, declaration map[string]any) AuthHeaders {
	key, ok := resolveAPIKey(apiKey, apiKeySet)
	supported := map[string]string{
		"User-Agent": fmt.Sprintf("weft-sdk-%s/%s", adapter, SDKVersion),
	}
	if ok {
		supported["Authorization"] = "Bearer " + key
	}
	if declared := declaredIdentityValue(declaration); declared != "" {
		supported[DeclaredHeader] = declared
	}
	headers := AuthHeaders{Supported: supported}
	if ok {
		headers.Settle = map[string]string{APIKeyHeader: key}
		headers.Verify = map[string]string{APIKeyHeader: key}
	}
	return headers
}

func resolveAPIKey(apiKey any, set bool) (string, bool) {
	if !set || apiKey == nil {
		return "", false
	}
	text, ok := apiKey.(string)
	if !ok {
		warn(fmt.Sprintf("ignoring apiKey: expected a string, got %s", jsType(apiKey)))
		return "", false
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		warn("ignoring empty apiKey")
		return "", false
	}
	if !headerSafe.MatchString(trimmed) {
		warn("ignoring apiKey: it contains whitespace or non-printable characters that cannot travel in an HTTP header")
		return "", false
	}
	return trimmed, true
}

func jsType(value any) string {
	switch value.(type) {
	case string:
		return "string"
	case float64, float32, int, int32, int64, json.Number:
		return "number"
	case bool:
		return "boolean"
	default:
		return "object"
	}
}

func declaredIdentityValue(declaration map[string]any) string {
	declared := SanitizeProductIdentity(declaration)
	dimensions := ResolveDimensions(declaration["dimensions"], createWarn())
	payload := declaredPayload{}
	if name, ok := declared["name"].(string); ok {
		payload.Name = name
	}
	if kind, ok := declared["type"].(string); ok {
		payload.Type = kind
	}
	if tags, ok := declared["tags"].([]string); ok && len(tags) > 0 {
		payload.Tags = tags
	}
	if icon, ok := declared["iconUrl"].(string); ok {
		payload.IconURL = icon
	}
	if len(dimensions) > 0 {
		payload.Dimensions = dimensions
	}
	if payload.Name == "" && payload.Type == "" && len(payload.Tags) == 0 && payload.IconURL == "" && len(payload.Dimensions) == 0 {
		return ""
	}
	encoded, err := marshalNoHTML(payload)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(encoded)
}

type declaredPayload struct {
	Name       string   `json:"name,omitempty"`
	Type       string   `json:"type,omitempty"`
	Tags       []string `json:"tags,omitempty"`
	IconURL    string   `json:"icon_url,omitempty"`
	Dimensions []string `json:"dimensions,omitempty"`
}

// MergeSellerWins merges derived headers under seller headers. Header names
// are compared case-insensitively and the seller spelling wins.
func MergeSellerWins(derived, seller map[string]string) map[string]string {
	merged := map[string]string{}
	for name, value := range derived {
		merged[name] = value
	}
	for name, value := range seller {
		for existing := range merged {
			if strings.EqualFold(existing, name) {
				delete(merged, existing)
			}
		}
		merged[name] = value
	}
	return merged
}

// AssertPathKeyedAuthHeaders rejects a flat header object the way @x402/core does.
func AssertPathKeyedAuthHeaders(headers map[string]any) error {
	if headers == nil {
		return nil
	}
	isObject := func(value any) bool {
		if value == nil {
			return false
		}
		_, ok := value.(map[string]any)
		if ok {
			return true
		}
		_, ok = value.(map[string]string)
		return ok
	}
	hasPath := false
	for _, key := range []string{"verify", "settle", "supported", "bazaar"} {
		if isObject(headers[key]) {
			hasPath = true
		}
	}
	looksFlat := !hasPath
	if looksFlat {
		flat := false
		for _, value := range headers {
			if !isObject(value) {
				flat = true
			}
		}
		looksFlat = flat
	}
	if looksFlat {
		return fmt.Errorf("createAuthHeaders must return an object keyed by facilitator path, e.g. { verify: { Authorization: \"...\" }, settle: { ... }, supported: { ... } }, but received a flat headers object.")
	}
	return nil
}
