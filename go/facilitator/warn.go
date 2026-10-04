package facilitator

import (
	"fmt"
	"os"
)

// emitWarning is the boot and request warning sink. Tests replace it.
var emitWarning = func(line string) {
	fmt.Fprintln(os.Stderr, line)
}

func warn(message string) {
	emitWarning("[weft] " + message)
}

// Warn reports one problem. dedupeKey defaults to the message.
type Warn func(message string, dedupeKey string)

func createWarn() Warn {
	seen := map[string]struct{}{}
	return func(message, dedupeKey string) {
		key := dedupeKey
		if key == "" {
			key = message
		}
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		warn(message)
	}
}
