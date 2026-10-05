package facilitator

import (
	"bytes"
	"encoding/json"
	"math"
	"reflect"
)

func jsonEqual(got, want any) bool {
	left, leftErr := json.Marshal(got)
	right, rightErr := json.Marshal(want)
	if leftErr != nil || rightErr != nil {
		return false
	}
	var a, b any
	if json.Unmarshal(left, &a) != nil || json.Unmarshal(right, &b) != nil {
		return false
	}
	return reflect.DeepEqual(a, b)
}

func marshalNoHTML(value any) ([]byte, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func stringifyJSON(value any) (string, error) {
	normalized, err := normalizeJSON(value, map[uintptr]struct{}{})
	if err != nil {
		return "", err
	}
	encoded, err := marshalNoHTML(normalized)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func normalizeJSON(value any, seen map[uintptr]struct{}) (any, error) {
	if value == nil {
		return nil, nil
	}
	rv := reflect.ValueOf(value)
	switch rv.Kind() {
	case reflect.Pointer, reflect.Interface:
		if rv.IsNil() {
			return nil, nil
		}
		return normalizeJSON(rv.Elem().Interface(), seen)
	case reflect.Map:
		if rv.IsNil() {
			return nil, nil
		}
		ptr := rv.Pointer()
		if _, ok := seen[ptr]; ok {
			return nil, errCircular
		}
		seen[ptr] = struct{}{}
		defer delete(seen, ptr)
		out := map[string]any{}
		for _, key := range rv.MapKeys() {
			item, err := normalizeJSON(rv.MapIndex(key).Interface(), seen)
			if err != nil {
				return nil, err
			}
			out[key.String()] = item
		}
		return out, nil
	case reflect.Slice, reflect.Array:
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return []any{}, nil
		}
		out := make([]any, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			item, err := normalizeJSON(rv.Index(i).Interface(), seen)
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

type circularError struct{}

func (circularError) Error() string { return "circular JSON" }

var errCircular = circularError{}
