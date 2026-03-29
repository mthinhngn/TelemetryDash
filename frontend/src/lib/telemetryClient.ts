import type { HistorySnapshot, TelemetryStreamMessage } from "../types/telemetry";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface HistoryRequest {
  minutes: number;
  limit: number;
}

export interface TelemetryClientHandlers {
  onStatusChange?: (status: ConnectionStatus) => void;
  onMessage: (message: TelemetryStreamMessage) => void;
  onError?: (error: unknown) => void;
}

export interface TelemetryClient {
  fetchHistory(request: HistoryRequest): Promise<HistorySnapshot>;
  connect(handlers: TelemetryClientHandlers): void;
  disconnect(): void;
}
