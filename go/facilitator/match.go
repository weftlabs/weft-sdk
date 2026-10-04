package facilitator

import (
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"strings"
)

var (
	percentOverride = regexp.MustCompile(`^(\d+(?:\.\d{0,2})?)%$`)
	dollarOverride  = regexp.MustCompile(`^\$(\d+(?:\.\d+)?)$`)
)

func findMatchingRequirement(requirements []map[string]any, payload map[string]any) (map[string]any, bool) {
	if int(numberOf(payload["x402Version"])) != 2 {
		return nil, false
	}
	accepted, _ := payload["accepted"].(map[string]any)
	if accepted == nil {
		return nil, false
	}
	for _, requirement := range requirements {
		if paymentRequirementsMatchAccepted(requirement, accepted) {
			return requirement, true
		}
	}
	return nil, false
}

func paymentRequirementsMatchAccepted(required, accepted map[string]any) bool {
	if !jsonEqual(withoutKey(required, "extra"), withoutKey(accepted, "extra")) {
		return false
	}
	requiredExtra, ok := required["extra"]
	if !ok || requiredExtra == nil {
		return true
	}
	return objectContainsSubset(requiredExtra, accepted["extra"])
}

func withoutKey(value map[string]any, key string) map[string]any {
	out := map[string]any{}
	for name, item := range value {
		if name == key {
			continue
		}
		out[name] = item
	}
	return out
}

func objectContainsSubset(expected, actual any) bool {
	if expected == nil {
		return true
	}
	expectedMap, expectedIsMap := expected.(map[string]any)
	if !expectedIsMap {
		return jsonEqual(expected, actual)
	}
	actualMap, actualIsMap := actual.(map[string]any)
	if !actualIsMap {
		return false
	}
	for key, value := range expectedMap {
		actualValue, ok := actualMap[key]
		if !ok {
			return false
		}
		if !objectContainsSubset(value, actualValue) {
			return false
		}
	}
	return true
}

func extensionEchoMismatch(serverExt map[string]any, payload map[string]any) bool {
	if len(serverExt) == 0 || payload == nil {
		return false
	}
	clientExt, _ := payload["extensions"].(map[string]any)
	if len(clientExt) == 0 {
		return false
	}
	for key, echoed := range clientExt {
		advertised, ok := serverExt[key]
		if !ok {
			continue
		}
		if !objectContainsSubset(extensionInfo(advertised), extensionInfo(echoed)) {
			return true
		}
	}
	return false
}

func extensionInfo(value any) any {
	object, ok := value.(map[string]any)
	if !ok {
		return value
	}
	if info, exists := object["info"]; exists {
		return info
	}
	return value
}

func applySettlementOverride(header string, requirement map[string]any, scheme *Scheme) (map[string]any, error) {
	if strings.TrimSpace(header) == "" {
		return requirement, nil
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(header), &decoded); err != nil {
		return requirement, nil
	}
	raw, _ := decoded["amount"].(string)
	if raw == "" {
		return requirement, nil
	}
	amount, err := resolveSettlementOverrideAmount(raw, requirement, scheme)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	for key, value := range requirement {
		out[key] = value
	}
	out["amount"] = amount
	return out, nil
}

func resolveSettlementOverrideAmount(raw string, requirement map[string]any, scheme *Scheme) (string, error) {
	if match := percentOverride.FindStringSubmatch(raw); match != nil {
		return percentOfAmount(match[1], stringOr(requirement["amount"]))
	}
	if match := dollarOverride.FindStringSubmatch(raw); match != nil {
		decimals, ok := assetDecimals(scheme, stringOr(requirement["asset"]), stringOr(requirement["network"]))
		if !ok {
			return "", fmt.Errorf("cannot convert dollar settlement override %q to atomic units: asset decimals are unknown", raw)
		}
		amount, err := convertToTokenAmount(match[1], decimals)
		if err != nil {
			return "", err
		}
		return amount, nil
	}
	return raw, nil
}

func percentOfAmount(percent, baseText string) (string, error) {
	intPart, decPart, _ := strings.Cut(percent, ".")
	decPart = (decPart + "00")[:2]
	scaled := new(big.Int)
	scaled.SetString(intPart, 10)
	scaled.Mul(scaled, big.NewInt(100))
	fraction := new(big.Int)
	fraction.SetString(decPart, 10)
	scaled.Add(scaled, fraction)
	base := new(big.Int)
	if _, ok := base.SetString(baseText, 10); !ok {
		return "", fmt.Errorf("cannot apply percent override to amount %q", baseText)
	}
	base.Mul(base, scaled)
	base.Div(base, big.NewInt(10000))
	return base.String(), nil
}

func convertToTokenAmount(decimalAmount string, decimals int) (string, error) {
	if strings.ContainsAny(decimalAmount, "eE") {
		return "", fmt.Errorf("invalid amount: %s — use decimal notation, not scientific notation", decimalAmount)
	}
	if !regexp.MustCompile(`^-?\d+\.?\d*$`).MatchString(decimalAmount) {
		return "", fmt.Errorf("invalid amount: %s", decimalAmount)
	}
	intPart, decPart, _ := strings.Cut(decimalAmount, ".")
	if decimals > 0 {
		decPart += strings.Repeat("0", decimals)
		decPart = decPart[:decimals]
	} else {
		decPart = ""
	}
	combined := strings.TrimLeft(intPart+decPart, "0")
	if combined == "" || combined == "-" {
		return "0", nil
	}
	return combined, nil
}

func assetDecimals(scheme *Scheme, asset, network string) (int, bool) {
	if scheme == nil || scheme.AssetDecimals == nil {
		return 0, false
	}
	return scheme.AssetDecimals(asset, network)
}

func refuseBeforeHandlerFlows(schemes []Scheme) error {
	for _, scheme := range schemes {
		for method, support := range scheme.PaymentFlows {
			flows := append([]string{}, support.Supported...)
			if support.Default != "" {
				flows = append(flows, support.Default)
			}
			for _, flow := range flows {
				if flow == "upfront" || flow == "escrow" {
					return fmt.Errorf("scheme %s asset transfer %s declares %s, which settles before the handler; escrow and upfront settlement are not implemented", scheme.Name, method, flow)
				}
				if flow != "authorization" {
					return fmt.Errorf("scheme %s declares unknown payment flow %q", scheme.Name, flow)
				}
			}
		}
	}
	return nil
}

func pendingSettlement(resp *SettleResponse) bool {
	return resp != nil && !resp.Success && resp.ErrorReason == "settlement_pending" && resp.TxHash != ""
}

func numberOf(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case json.Number:
		number, _ := typed.Float64()
		return number
	default:
		return 0
	}
}

func copyMap(value map[string]any) map[string]any {
	out := map[string]any{}
	for key, item := range value {
		out[key] = item
	}
	return out
}
