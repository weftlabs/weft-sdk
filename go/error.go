package weft

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// ErrValidation marks a caller mistake that is rejected before any HTTP request.
var ErrValidation = errors.New("weft: validation")

// Charge says whether a failed call can have created a charge. ChargeNone
// covers this call only: an earlier call under the same idempotency key can
// still have paid. After ChargePossible, retry only with the same idempotency
// key and request.
//
// The zero value "" means unknown; treat it like ChargePossible.
type Charge string

const (
	ChargeNone     Charge = "none"
	ChargePossible Charge = "possible"
)

// preSignFetchCodes are raised by Weft before it signs a payment in that call.
// Same list as the TypeScript reference.
var preSignFetchCodes = map[string]bool{
	"EXCEEDED_MAX_COST":           true,
	"MERCHANT_RETURNED_NON_402":   true,
	"INSUFFICIENT_BALANCE":        true,
	"DENYLISTED_RECIPIENT":        true,
	"WALLET_ENVIRONMENT_MISMATCH": true,
	"UNSUPPORTED_ASSET":           true,
	"INVALID_REQUEST":             true,
	"UNKNOWN_PARAMETER":           true,
	"INVALID_URL":                 true,
	"INVALID_MAX_COST_USD":        true,
	"UNSUPPORTED_METHOD":          true,
	"INVALID_BODY":                true,
	"INVALID_HEADERS":             true,
	"INVALID_IDEMPOTENCY_KEY":     true,
}

var idempotencyKeyPattern = regexp.MustCompile(`^[!-~]{1,255}$`)

// decodeError reports a 2xx fetch response that did not decode. A replay
// returns the same body, so the caller reconciles instead of retrying.
func decodeError(cause error) *Error {
	return &Error{
		Code:       "RESPONSE_DECODE_ERROR",
		Message:    "Weft API returned a fetch response that could not be decoded",
		Retryable:  false,
		Charge:     ChargePossible,
		Details:    cause,
		hasDetails: cause != nil,
	}
}

func fetchCharge(status int, code string) Charge {
	preSign := preSignFetchCodes[code] || strings.HasPrefix(code, "POLICY_VIOLATION_")
	if status >= 400 && status < 500 && preSign {
		return ChargeNone
	}
	return ChargePossible
}

// Error is the normalized buyer-API failure. It matches the TypeScript WeftError
// fields: status 0 and code NETWORK_ERROR mean the outcome is uncertain.
type Error struct {
	Status     int
	Code       string
	Message    string
	RequestID  *string
	Retryable  bool
	Details    any
	Charge     Charge
	hasDetails bool
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

// HasDetails reports whether an HTTP error body was parsed as JSON.
// A non-JSON body has no details object.
func (e *Error) HasDetails() bool {
	return e != nil && e.hasDetails
}

type validationError struct {
	msg string
}

func (e *validationError) Error() string { return e.msg }

func (e *validationError) Unwrap() error { return ErrValidation }

func validation(msg string) error {
	return &validationError{msg: msg}
}

func normalizeHTTPError(resp *http.Response, body []byte) *Error {
	status := 0
	if resp != nil {
		status = resp.StatusCode
	}
	out := &Error{
		Status:    status,
		Code:      fmt.Sprintf("HTTP_%d", status),
		Message:   fmt.Sprintf("Weft API returned HTTP %d", status),
		Retryable: status == http.StatusTooManyRequests || status >= 500,
		Charge:    ChargeNone,
	}
	if resp != nil && resp.Header.Values("X-Request-Id") != nil {
		raw := resp.Header.Get("X-Request-Id")
		out.RequestID = &raw
	}
	if len(body) == 0 {
		return out
	}
	var details any
	if err := json.Unmarshal(body, &details); err != nil {
		return out
	}
	out.Details = details
	out.hasDetails = true
	asMap, _ := details.(map[string]any)
	var nested map[string]any
	if asMap != nil {
		switch value := asMap["error"].(type) {
		case map[string]any:
			nested = value
		case string:
			out.Code = value
		}
		if code, ok := asMap["code"].(string); ok && nested == nil && out.Code == fmt.Sprintf("HTTP_%d", status) {
			out.Code = code
		}
		if message, ok := asMap["message"].(string); ok && nested == nil {
			out.Message = message
		}
		if id, ok := asString(asMap["request_id"]); ok {
			out.RequestID = &id
		}
	}
	if nested != nil {
		if code, ok := nested["code"].(string); ok {
			out.Code = code
		}
		if message, ok := nested["message"].(string); ok {
			out.Message = message
		}
		if id, ok := asString(nested["request_id"]); ok {
			out.RequestID = &id
		}
	}
	return out
}

func asString(value any) (string, bool) {
	text, ok := value.(string)
	return text, ok
}

func transportMessage(err error) string {
	if err == nil {
		return "connection reset"
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) && urlErr.Err != nil {
		return transportMessage(urlErr.Err)
	}
	if err.Error() == "" {
		return "connection reset"
	}
	return err.Error()
}

func networkError(err error) *Error {
	message := transportMessage(err)
	return &Error{
		Status:     0,
		Code:       "NETWORK_ERROR",
		Message:    "Network failure before a Weft API response: " + message,
		Retryable:  true,
		Charge:     ChargeNone,
		Details:    err,
		hasDetails: err != nil,
	}
}

func readBody(resp *http.Response) ([]byte, error) {
	if resp == nil || resp.Body == nil {
		return nil, nil
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
