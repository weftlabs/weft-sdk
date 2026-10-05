package facilitator

import (
	"encoding/base64"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestFacilitatorConformance(t *testing.T) {
	dir := filepath.Join("..", "..", "conformance", "facilitator")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read facilitator fixtures: %v", err)
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		payload, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name(), err)
		}
		var cases []map[string]any
		if err := json.Unmarshal(payload, &cases); err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
		for _, item := range cases {
			count++
			item := item
			name, _ := item["name"].(string)
			t.Run(entry.Name()+"/"+name, func(t *testing.T) {
				if languages, ok := item["languages"].([]any); ok {
					allowed := false
					for _, language := range languages {
						if language == "go" {
							allowed = true
						}
					}
					if !allowed {
						t.Fatalf("languages excludes go; do not skip a concept Go can express")
					}
				}
				switch entry.Name() {
				case "auth-headers.json":
					assertAuthHeaders(t, substitute(item))
				case "declared-header.json":
					assertDeclaredHeader(t, item)
				case "product-identity.json":
					assertProductIdentity(t, item)
				case "request-extension.json":
					assertRequestExtension(t, item)
				case "facilitator-url.json":
					assertFacilitatorURL(t, item)
				case "settlement.json":
					reason, _ := item["reason"].(string)
					if item["reason"] == nil {
						reason = ""
					}
					if IsFacilitatorUnavailable(reason) != item["expect"].(bool) {
						t.Fatalf("unavailable(%q) = %v, want %v", reason, IsFacilitatorUnavailable(reason), item["expect"])
					}
				case "route-match.json":
					assertRouteMatch(t, item)
				case "requirements-match.json":
					assertRequirementsMatch(t, item)
				default:
					t.Fatalf("no facilitator runner for %s", entry.Name())
				}
			})
		}
	}
	if count == 0 {
		t.Fatal("no facilitator conformance cases")
	}
}

func TestInvalidPercentEscapeKeepsTheSegment(t *testing.T) {
	for _, path := range []string{"/files/%FF", "/files/%C3%28", "/files/%"} {
		got := normalizePath(path)
		if got != path {
			t.Fatalf("normalizePath(%q) = %q, want the original segment", path, got)
		}
	}
}

func assertRequirementsMatch(t *testing.T, testCase map[string]any) {
	t.Helper()
	required, ok := testCase["required"].(map[string]any)
	if !ok {
		t.Fatalf("required is %T", testCase["required"])
	}
	accepted, ok := testCase["accepted"].(map[string]any)
	if !ok {
		t.Fatalf("accepted is %T", testCase["accepted"])
	}
	_, matched := findMatchingRequirement([]map[string]any{required}, map[string]any{
		"x402Version": float64(2),
		"accepted":    accepted,
		"payload":     map[string]any{},
	})
	if matched != testCase["match"].(bool) {
		t.Fatalf("match %v, want %v", matched, testCase["match"])
	}
}

func assertRouteMatch(t *testing.T, testCase map[string]any) {
	t.Helper()
	verb, re, err := compilePattern(stringOr(testCase["pattern"]))
	if err != nil {
		t.Fatalf("compile %q: %v", testCase["pattern"], err)
	}
	normalized := normalizePath(stringOr(testCase["path"]))
	method := strings.ToUpper(stringOr(testCase["method"]))
	got := re.MatchString(normalized) && (verb == "*" || verb == method)
	if got != testCase["match"].(bool) {
		t.Fatalf("pattern %q method %s path %q normalized %q match %v, want %v", testCase["pattern"], method, testCase["path"], normalized, got, testCase["match"])
	}
}

func assertAuthHeaders(t *testing.T, testCase map[string]any) {
	t.Helper()
	args := testCase["args"].(map[string]any)
	expect := testCase["expect"].(map[string]any)
	_, set := args["apiKey"]
	var warnings []string
	previous := emitWarning
	emitWarning = func(line string) { warnings = append(warnings, line) }
	defer func() { emitWarning = previous }()
	headers := BuildFacilitatorAuthHeaders(args["adapter"].(string), args["apiKey"], set, mapField(args, "declaration"))
	wantSupported := stringMap(expect["supported"].(map[string]any))
	if expect["declared"].(bool) {
		if headers.Supported[DeclaredHeader] == "" {
			t.Fatal("expected declared header")
		}
		wantSupported[DeclaredHeader] = headers.Supported[DeclaredHeader]
	} else if _, ok := headers.Supported[DeclaredHeader]; ok {
		t.Fatal("declared header should be absent")
	}
	if !reflect.DeepEqual(headers.Supported, wantSupported) {
		t.Fatalf("supported %#v, want %#v", headers.Supported, wantSupported)
	}
	assertHeaderMap(t, "settle", headers.Settle, expect["settle"])
	assertHeaderMap(t, "verify", headers.Verify, expect["verify"])
	if len(warnings) != int(expect["warnings"].(float64)) {
		t.Fatalf("warnings %d %#v, want %v", len(warnings), warnings, expect["warnings"])
	}
	if secrets, ok := expect["absentFromLogs"].([]any); ok {
		for _, secret := range secrets {
			for _, line := range warnings {
				if strings.Contains(line, secret.(string)) {
					t.Fatalf("secret %q appeared in %q", secret, line)
				}
			}
		}
	}
}

func assertDeclaredHeader(t *testing.T, testCase map[string]any) {
	t.Helper()
	expect := testCase["expect"].(map[string]any)
	var warnings []string
	previous := emitWarning
	emitWarning = func(line string) { warnings = append(warnings, line) }
	defer func() { emitWarning = previous }()
	headers := BuildFacilitatorAuthHeaders("express", nil, false, testCase["declaration"].(map[string]any))
	encoded := headers.Supported[DeclaredHeader]
	if !expect["present"].(bool) {
		if encoded != "" {
			t.Fatalf("header present: %s", encoded)
		}
	} else {
		if encoded == "" || strings.ContainsAny(encoded, "+/=") {
			t.Fatalf("declared encoding %q", encoded)
		}
		if !jsonEqual(decodeDeclared(t, encoded), expect["json"]) {
			t.Fatalf("decoded %#v, want %#v", decodeDeclared(t, encoded), expect["json"])
		}
		if encoded != encodeDeclared(canonicalDeclared(expect["json"].(map[string]any))) {
			t.Fatalf("encoding %s, want %s", encoded, encodeDeclared(canonicalDeclared(expect["json"].(map[string]any))))
		}
	}
	if !reflect.DeepEqual(classifyMany(warnings, classifyProductWarning), stringList(expect["warningKeys"])) {
		t.Fatalf("warnings %#v classified %#v, want %#v", warnings, classifyMany(warnings, classifyProductWarning), expect["warningKeys"])
	}
}

func assertProductIdentity(t *testing.T, testCase map[string]any) {
	t.Helper()
	expect := testCase["expect"].(map[string]any)
	routes := testCase["routes"]
	var warnings []string
	previous := emitWarning
	emitWarning = func(line string) { warnings = append(warnings, line) }
	defer func() { emitWarning = previous }()
	result := ApplyProductIdentity(routes, testCase["declaration"].(map[string]any))
	if expect["unchanged"] == true {
		if reflect.ValueOf(result).Pointer() != reflect.ValueOf(routes).Pointer() {
			t.Fatal("expected the input routes by reference")
		}
	} else {
		want := expect["route"]
		if want == nil {
			want = expect["routes"]
		}
		if !jsonEqual(result, want) {
			got, _ := json.Marshal(result)
			expected, _ := json.Marshal(want)
			t.Fatalf("routes %s, want %s", got, expected)
		}
	}
	got := uniqueSorted(classifyMany(warnings, classifyProductWarning))
	want := stringList(expect["rejected"])
	sort.Strings(want)
	if got == nil {
		got = []string{}
	}
	if want == nil {
		want = []string{}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("rejected %#v from %#v, want %#v", got, warnings, want)
	}
}

func assertRequestExtension(t *testing.T, testCase map[string]any) {
	t.Helper()
	key := testCase["key"].(string)
	expect := testCase["expect"].(map[string]any)
	extensions := map[string]any{}
	if raw, ok := testCase["extensions"].(map[string]any); ok {
		for name, value := range raw {
			extensions[name] = value
		}
	}
	resolved := materialize(testCase["resolved"])
	extensions[key] = func() (any, error) { return resolved, nil }
	var warnings []string
	shipped := EnrichDynamicExtension(key, extensions[key], extensions, true, func(message, _ string) {
		warnings = append(warnings, "[weft] "+message)
	})
	if expect["dropped"].(bool) {
		if shipped != nil {
			t.Fatalf("shipped %#v, want dropped", shipped)
		}
		if _, ok := extensions[key]; ok {
			t.Fatal("dropped key still present")
		}
		if remaining, ok := expect["remaining"]; ok && !jsonEqual(extensions, remaining) {
			t.Fatalf("remaining %#v, want %#v", extensions, remaining)
		}
	} else if !jsonEqual(shipped, expect["shipped"]) {
		got, _ := json.Marshal(shipped)
		want, _ := json.Marshal(expect["shipped"])
		t.Fatalf("shipped %s, want %s", got, want)
	}
	if !reflect.DeepEqual(classifyMany(warnings, classifyExtensionWarning), stringList(expect["warningKeys"])) {
		t.Fatalf("warnings %#v, want %#v", warnings, expect["warningKeys"])
	}
}

func assertFacilitatorURL(t *testing.T, testCase map[string]any) {
	t.Helper()
	args := testCase["args"].(map[string]any)
	previous := os.Getenv(EnvURL)
	if env, ok := args["env"].(map[string]any); ok {
		if value, ok := env[EnvURL].(string); ok {
			t.Setenv(EnvURL, value)
		}
	} else {
		os.Unsetenv(EnvURL)
	}
	t.Cleanup(func() {
		if previous == "" {
			os.Unsetenv(EnvURL)
		} else {
			os.Setenv(EnvURL, previous)
		}
	})
	switch testCase["fn"] {
	case "resolveUrl":
		var config *Config
		if raw, ok := args["config"].(map[string]any); ok {
			config = &Config{}
			if url, ok := raw["url"].(string); ok {
				config.URL = url
			}
		}
		if ResolveURL(config) != testCase["expect"] {
			t.Fatalf("resolve %q, want %v", ResolveURL(config), testCase["expect"])
		}
	case "validateUrl":
		err := ValidateURL(stringOr(args["url"]))
		if (err != nil) != testCase["expectError"].(bool) {
			t.Fatalf("validate error %v, want error %v", err, testCase["expectError"])
		}
	default:
		t.Fatalf("unknown url function %v", testCase["fn"])
	}
}

func substitute(value map[string]any) map[string]any {
	encoded, _ := json.Marshal(value)
	text := strings.ReplaceAll(string(encoded), "$ADAPTER", AdapterName)
	text = strings.ReplaceAll(text, "$SDK_VERSION", SDKVersion)
	var out map[string]any
	_ = json.Unmarshal([]byte(text), &out)
	return out
}

func materialize(value any) any {
	object, ok := value.(map[string]any)
	if !ok || len(object) != 1 {
		return value
	}
	kind, ok := object["$fixture"].(string)
	if !ok {
		return value
	}
	switch kind {
	case "circular":
		circular := map[string]any{}
		circular["self"] = circular
		return circular
	case "nan-field":
		return map[string]any{"n": math.NaN()}
	default:
		panic("unknown fixture " + kind)
	}
}

func decodeDeclared(t *testing.T, value string) any {
	t.Helper()
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		t.Fatalf("decode declared: %v", err)
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("parse declared: %v", err)
	}
	return out
}

func encodeDeclared(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func canonicalDeclared(value map[string]any) string {
	payload := declaredPayload{}
	if text, ok := value["name"].(string); ok {
		payload.Name = text
	}
	if text, ok := value["type"].(string); ok {
		payload.Type = text
	}
	payload.Tags = stringList(value["tags"])
	if text, ok := value["icon_url"].(string); ok {
		payload.IconURL = text
	}
	payload.Dimensions = stringList(value["dimensions"])
	encoded, _ := marshalNoHTML(payload)
	return string(encoded)
}

func classifyMany(lines []string, classify func(string) string) []string {
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		out = append(out, classify(line))
	}
	sort.Strings(out)
	return out
}

func classifyProductWarning(message string) string {
	text := strings.TrimPrefix(message, "[weft] ")
	switch {
	case strings.Contains(text, "route serviceName") || strings.Contains(text, "product name") || strings.HasPrefix(text, "ignoring name"):
		return "name"
	case strings.Contains(text, "route type") || strings.HasPrefix(text, "ignoring type"):
		return "type"
	case strings.Contains(text, "tag"):
		return "tags"
	case strings.Contains(text, "iconUrl"):
		return "iconUrl"
	case strings.Contains(text, "productId"):
		return "productId"
	case strings.Contains(text, "manifestHash"):
		return "manifestHash"
	case strings.Contains(text, "dimension"):
		return "dimensions"
	case strings.Contains(text, "route extensions"):
		return "extensions"
	case strings.HasPrefix(text, "ignoring route"):
		return "route"
	default:
		return "unclassified:" + text
	}
}

func classifyExtensionWarning(message string) string {
	text := strings.TrimPrefix(message, "[weft] ")
	match := regexp.MustCompile(`^extensions\[([^\]]+)\]`).FindStringSubmatch(text)
	if match == nil {
		return "unclassified:" + text
	}
	key := match[1]
	switch {
	case strings.Contains(text, "over the"):
		return key + ":over-cap"
	case strings.Contains(text, "JSON cannot carry"):
		return key + ":unserializable"
	case strings.Contains(text, "callback failed"):
		return key + ":threw"
	case strings.Contains(text, "no HTTP request"):
		return key + ":no-request"
	case strings.Contains(text, "returned"):
		return key + ":not-an-object"
	default:
		return "unclassified:" + text
	}
}

func uniqueSorted(values []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func stringList(value any) []string {
	list, _ := value.([]any)
	out := make([]string, 0, len(list))
	for _, item := range list {
		out = append(out, item.(string))
	}
	sort.Strings(out)
	return out
}

func mapField(value map[string]any, key string) map[string]any {
	out, _ := value[key].(map[string]any)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func assertHeaderMap(t *testing.T, name string, got map[string]string, want any) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Fatalf("%s %#v, want nil", name, got)
		}
		return
	}
	if !reflect.DeepEqual(got, stringMap(want.(map[string]any))) {
		t.Fatalf("%s %#v, want %#v", name, got, want)
	}
}
