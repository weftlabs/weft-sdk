package facilitator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const DefaultURL = "https://x402.weft.network"
const EnvURL = "X402_FACILITATOR_URL"
const DefaultCacheTTL = 5 * time.Minute

var ErrInvalidURL = errors.New("invalid URL")
var ErrFeeNotFound = errors.New("fee information not found in /supported response")

type Config struct {
	URL        string
	HTTPClient *http.Client
	Timeout    time.Duration
	// Auth returns path-keyed headers. Nil means no extra headers.
	Auth func(path string) (map[string]string, error)
}

type FeeInfo struct {
	Amount  string `json:"amount"`
	Asset   string `json:"asset"`
	Network string `json:"network"`
}

type FeeCacheConfig struct {
	TTL time.Duration
}

type feeCache struct {
	feeInfo   *FeeInfo
	fetchedAt time.Time
	ttl       time.Duration
}

type HTTPFacilitatorClient struct {
	url        string
	httpClient *http.Client
	auth       func(path string) (map[string]string, error)
}

func ValidateURL(url string) error {
	if url == "" || strings.TrimSpace(url) == "" {
		return fmt.Errorf("%w: URL cannot be empty", ErrInvalidURL)
	}
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return fmt.Errorf("%w: URL must start with http:// or https://, got: %s", ErrInvalidURL, url)
	}
	return nil
}

func ResolveURL(config *Config) string {
	if config != nil && config.URL != "" {
		return config.URL
	}
	if envURL := os.Getenv(EnvURL); envURL != "" {
		return envURL
	}
	return DefaultURL
}

func NewFacilitatorClient(config *Config) (*HTTPFacilitatorClient, error) {
	url := ResolveURL(config)
	if err := ValidateURL(url); err != nil {
		return nil, err
	}

	httpClient := http.DefaultClient
	timeout := 30 * time.Second
	if config != nil {
		if config.HTTPClient != nil {
			httpClient = config.HTTPClient
		}
		if config.Timeout > 0 {
			timeout = config.Timeout
		}
	}

	if config == nil || config.HTTPClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}

	var auth func(path string) (map[string]string, error)
	if config != nil {
		auth = config.Auth
	}
	return &HTTPFacilitatorClient{
		url:        strings.TrimRight(url, "/"),
		httpClient: httpClient,
		auth:       auth,
	}, nil
}

func (c *HTTPFacilitatorClient) URL() string {
	return c.url
}

type VerifyRequest struct {
	X402Version         int         `json:"x402Version"`
	PaymentPayload      interface{} `json:"paymentPayload"`
	PaymentRequirements interface{} `json:"paymentRequirements"`
}

type VerifyResponse struct {
	Valid         bool   `json:"isValid"`
	Message       string `json:"invalidMessage,omitempty"`
	InvalidReason string `json:"invalidReason,omitempty"`
}

type SettleRequest struct {
	X402Version         int         `json:"x402Version"`
	PaymentPayload      interface{} `json:"paymentPayload"`
	PaymentRequirements interface{} `json:"paymentRequirements"`
}

type SettleResponse struct {
	Success     bool   `json:"success"`
	TxHash      string `json:"transaction,omitempty"`
	Message     string `json:"errorMessage,omitempty"`
	ErrorReason string `json:"errorReason,omitempty"`
	Payer       string `json:"payer,omitempty"`
	Network     string `json:"network,omitempty"`
}

type SupportedKind struct {
	X402Version int    `json:"x402Version"`
	Scheme      string `json:"scheme"`
	Network     string `json:"network"`
}

type SupportedResponse struct {
	Kinds      []SupportedKind     `json:"kinds"`
	Extensions []string            `json:"extensions,omitempty"`
	Signers    map[string][]string `json:"signers,omitempty"`
	Fee        *FeeInfo            `json:"fee,omitempty"`
}

func (c *HTTPFacilitatorClient) Verify(ctx context.Context, payload, requirements interface{}) (*VerifyResponse, error) {
	reqBody := VerifyRequest{
		X402Version:         2,
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal verify request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/verify", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create verify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if err := c.applyAuth(req, "verify"); err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("verify request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == http.StatusServiceUnavailable {
			return nil, errors.New(FacilitatorUnavailableError)
		}
		return nil, fmt.Errorf("facilitator verify failed (%d): %s", resp.StatusCode, string(body))
	}

	var verifyResp VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResp); err != nil {
		return nil, fmt.Errorf("failed to decode verify response: %w", err)
	}

	return &verifyResp, nil
}

func (c *HTTPFacilitatorClient) Settle(ctx context.Context, payload, requirements interface{}) (*SettleResponse, error) {
	reqBody := SettleRequest{
		X402Version:         2,
		PaymentPayload:      payload,
		PaymentRequirements: requirements,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal settle request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.url+"/settle", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create settle request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if err := c.applyAuth(req, "settle"); err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("settle request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == http.StatusServiceUnavailable {
			var candidate SettleResponse
			if json.Unmarshal(raw, &candidate) == nil && pendingSettlement(&candidate) {
				return &candidate, nil
			}
			if err := classifySettleUnavailable(raw); err != nil {
				return nil, err
			}
		}
		return nil, fmt.Errorf("Facilitator settle failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var settleResp SettleResponse
	if err := json.NewDecoder(resp.Body).Decode(&settleResp); err != nil {
		return nil, fmt.Errorf("failed to decode settle response: %w", err)
	}

	return &settleResp, nil
}

func (c *HTTPFacilitatorClient) GetSupported(ctx context.Context) (*SupportedResponse, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.url+"/supported", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create supported request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if err := c.applyAuth(req, "supported"); err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("supported request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("facilitator supported failed (%d): %s", resp.StatusCode, string(body))
	}

	var supportedResp SupportedResponse
	if err := json.NewDecoder(resp.Body).Decode(&supportedResp); err != nil {
		return nil, fmt.Errorf("failed to decode supported response: %w", err)
	}

	return &supportedResp, nil
}

func (c *HTTPFacilitatorClient) applyAuth(req *http.Request, path string) error {
	if c.auth == nil {
		return nil
	}
	headers, err := c.auth(path)
	if err != nil {
		return err
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	return nil
}

func classifySettleUnavailable(raw []byte) error {
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil || body == nil {
		return fmt.Errorf("Facilitator settle failed (503): %s", strings.TrimSpace(string(raw)))
	}
	if _, ok := body["success"]; !ok {
		return fmt.Errorf("Facilitator settle failed (503): %s", strings.TrimSpace(string(raw)))
	}
	_, hasReason := body["errorReason"]
	_, hasMessage := body["errorMessage"]
	_, hasPayer := body["payer"]
	_, hasTx := body["transaction"]
	_, hasNetwork := body["network"]
	if !(hasReason && hasMessage && hasPayer && hasTx && hasNetwork) {
		return fmt.Errorf("Facilitator settle failed (503): %s", strings.TrimSpace(string(raw)))
	}
	reason, _ := body["errorReason"].(string)
	tx, _ := body["transaction"].(string)
	if reason == "settlement_pending" && tx != "" {
		return nil
	}
	return errors.New(FacilitatorUnavailableError)
}
