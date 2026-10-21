import { beforeEach } from "vitest";
import { resetSharedSupported } from "../src/facilitator/client";
import { resetMiddlewareConstructions } from "../src/facilitator/middleware/handshake";

// The handshake is shared per process; tests each need a fresh process.
beforeEach(() => {
  resetSharedSupported();
  resetMiddlewareConstructions();
});
