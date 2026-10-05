package weft

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// ErrValidation marks a caller mistake that is rejected before any HTTP request.
var ErrValidation = errors.New("weft: validation")

// Error is the normalized buyer-API failure. It matches the TypeScript WeftError
// fields: status 0 and code NETWORK_ERROR mean the outcome is uncertain.
type Error struct {
	Status     int
	Code       string
	Message    string
	RequestID  *string
	Retryable  bool
	Details    any
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
