package facilitator

import "regexp"

var coreFacilitatorUnavailable = regexp.MustCompile(`^Facilitator settle failed \(503\):(?: |$)`)

// IsFacilitatorUnavailable reports the TypeScript settlement classification.
func IsFacilitatorUnavailable(reason string) bool {
	return reason == FacilitatorUnavailableError || coreFacilitatorUnavailable.MatchString(reason)
}
