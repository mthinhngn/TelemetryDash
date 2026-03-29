import { appConfig } from "../config";
import { ApiTelemetryClient } from "./apiTelemetryClient";
import { MockTelemetryClient } from "./mockTelemetryClient";
import type { TelemetryClient } from "./telemetryClient";

export function createTelemetryClient(): TelemetryClient {
  return appConfig.useMockData ? new MockTelemetryClient() : new ApiTelemetryClient();
}
