package facilitator

import (
	"encoding/json"
	"fmt"
	"reflect"
)

const (
	// RequestExtensionKey is the per-request seller context extension.
	RequestExtensionKey = "weft.request"
	// MaxExtensionBytes is the facilitator relay cap for the extensions object.
	MaxExtensionBytes = 16 * 1024
)

// RequestInfoSchema is the published weft.request info schema.
func RequestInfoSchema() map[string]any {
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title":   "Weft per-request context",
		"description": "Seller-authored context for one paid request, for display only. " +
			"Unauthenticated buyer input by the time it is read; key nothing on it.",
		"type":                 "object",
		"additionalProperties": true,
	}
}

// DynamicExtension computes one extension value for the current request.
type DynamicExtension func() (any, error)

// EnrichDynamicExtension resolves one callback the way the TypeScript hook does.
// A dropped key is removed from extensions. A shipped value is the wire object.
func EnrichDynamicExtension(key string, declaration any, extensions map[string]any, hasRequest bool, sink Warn) any {
	if sink == nil {
		sink = func(string, string) {}
	}
	fn, ok := asDynamic(declaration)
	if !ok {
		return nil
	}
	if !hasRequest {
		sink(fmt.Sprintf("extensions[%s] is a callback but no HTTP request context reached it; dropping the key from the challenge", key), key+":no-request")
		delete(extensions, key)
		return nil
	}
	resolved, err := fn()
	if err != nil {
		sink(fmt.Sprintf("extensions[%s] callback failed; dropping the key from the challenge: %s", key, err.Error()), key+":threw")
		delete(extensions, key)
		return nil
	}
	if resolved == nil {
		delete(extensions, key)
		return nil
	}
	encoded, err := stringifyJSON(resolved)
	if err != nil {
		sink(fmt.Sprintf("extensions[%s] callback returned a value JSON cannot carry (a function, a circular reference, a BigInt or similar); dropping the key from the challenge", key), key+":unserializable")
		delete(extensions, key)
		return nil
	}
	var wire any
	if err := unmarshalJSON([]byte(encoded), &wire); err != nil {
		sink(fmt.Sprintf("extensions[%s] callback returned a value JSON cannot carry (a function, a circular reference, a BigInt or similar); dropping the key from the challenge", key), key+":unserializable")
		delete(extensions, key)
		return nil
	}
	if !isObject(wire) {
		kind := "a " + jsonKind(wire)
		if _, ok := wire.([]any); ok {
			kind = "an array"
		}
		sink(fmt.Sprintf("extensions[%s] callback returned %s; the x402 extensions channel carries objects, so the key is dropped from the challenge", key, kind), key+":not-an-object")
		delete(extensions, key)
		return nil
	}
	value := wire
	if key == RequestExtensionKey {
		value = map[string]any{"info": wire, "schema": RequestInfoSchema()}
	}
	projected := map[string]any{}
	for name, item := range extensions {
		if _, isFn := asDynamic(item); isFn {
			continue
		}
		projected[name] = item
	}
	projected[key] = value
	encodedMap, err := marshalNoHTML(projected)
	bytes := len(encoded)
	if err == nil {
		bytes = len(encodedMap)
	}
	if bytes > MaxExtensionBytes {
		sink(fmt.Sprintf("extensions[%s] takes the challenge's extensions to %d bytes, over the %d-byte facilitator relay cap; dropping the key so the rest of the declaration still reaches settlement", key, bytes, MaxExtensionBytes), key+":over-cap")
		delete(extensions, key)
		return nil
	}
	return value
}

func asDynamic(value any) (DynamicExtension, bool) {
	switch fn := value.(type) {
	case DynamicExtension:
		return fn, true
	case func() (any, error):
		return fn, true
	case func() any:
		return func() (any, error) { return fn(), nil }, true
	default:
		rv := reflect.ValueOf(value)
		if rv.IsValid() && rv.Kind() == reflect.Func {
			return func() (any, error) {
				out := rv.Call(nil)
				if len(out) == 0 {
					return nil, nil
				}
				var err error
				if len(out) > 1 && !out[1].IsNil() {
					err, _ = out[1].Interface().(error)
				}
				if !out[0].IsValid() || (out[0].Kind() == reflect.Interface && out[0].IsNil()) {
					return nil, err
				}
				return out[0].Interface(), err
			}, true
		}
		return nil, false
	}
}

func isObject(value any) bool {
	_, ok := value.(map[string]any)
	return ok
}

func unmarshalJSON(data []byte, dest any) error {
	return json.Unmarshal(data, dest)
}

func jsonKind(value any) string {
	if value == nil {
		return "null"
	}
	switch value.(type) {
	case string:
		return "string"
	case float64, float32, int, json.Number:
		return "number"
	case bool:
		return "boolean"
	default:
		return "object"
	}
}
