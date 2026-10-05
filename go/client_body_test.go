package weft

import (
	"encoding/json"
	"math"
	"testing"
)

func TestFetchBodyJSONContainers(t *testing.T) {
	cases := []struct {
		name      string
		body      any
		want      string
		container bool
	}{
		{name: "slice any", body: []any{"a"}, want: `["a"]`, container: true},
		{name: "slice string", body: []string{"a"}, want: `["a"]`, container: true},
		{name: "map any", body: map[string]any{"n": 1}, want: `{"n":1}`, container: true},
		{name: "map int", body: map[string]int{"n": 1}, want: `{"n":1}`, container: true},
		{name: "bytes", body: []byte("a"), container: false},
		{name: "raw message", body: json.RawMessage(`{"ok":true}`), want: `{"ok":true}`, container: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isJSONContainer(tc.body); got != tc.container {
				t.Fatalf("isJSONContainer = %v, want %v", got, tc.container)
			}
			wire, err := fetchWire(FetchRequest{URL: "https://example.test", MaxCostUSD: "1", Body: tc.body})
			if err != nil {
				t.Fatal(err)
			}
			if !tc.container {
				if _, ok := wire["body"].(string); ok {
					t.Fatalf("[]byte was stringified to %#v", wire["body"])
				}
				return
			}
			if wire["body"] != tc.want {
				t.Fatalf("body %#v, want %s", wire["body"], tc.want)
			}
		})
	}
}

func TestFetchBodyNaNAndInfSerializeAsNull(t *testing.T) {
	wire, err := fetchWire(FetchRequest{
		URL:        "https://example.test",
		MaxCostUSD: "1",
		Body: map[string]any{
			"n":      math.NaN(),
			"inf":    math.Inf(1),
			"ninf":   math.Inf(-1),
			"nested": []any{math.NaN(), math.Inf(-1)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"inf":null,"n":null,"nested":[null,null],"ninf":null}`
	if wire["body"] != want {
		t.Fatalf("body %#v, want %s", wire["body"], want)
	}
}
