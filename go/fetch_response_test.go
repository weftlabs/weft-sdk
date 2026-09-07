package weft

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/weftlabs/weft-sdk/go/generated"
)

func TestSIWXResponsePreservesNullableReceipt(t *testing.T) {
	for _, artifact := range []string{"42", "null"} {
		t.Run(artifact, func(t *testing.T) {
			body := []byte(`{"status":200,"headers":{"content-type":"application/json"},"body_base64":"e30=","paid_usd":"0.00","held_usd":null,"payment_status":"not_required","tx_hash":null,"protocol":"x402","artifact_id":` + artifact + `}`)
			var response generated.FetchResponse
			if err := json.Unmarshal(body, &response); err != nil {
				t.Fatal(err)
			}
			if response.GetPaymentStatus() != "not_required" || response.GetBodyBase64() != "e30=" {
				t.Fatalf("lost receipt or body: %#v", response)
			}
			encoded, err := json.Marshal(response)
			if err != nil {
				t.Fatal(err)
			}
			var want, got map[string]interface{}
			if err := json.Unmarshal(body, &want); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(encoded, &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(want, got) {
				t.Fatalf("receipt changed during round trip: want %s, got %s", body, encoded)
			}
		})
	}
}
