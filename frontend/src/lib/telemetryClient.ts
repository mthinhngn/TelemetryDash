import type { TelemetryHistoryResponse, TelemetryStreamMessage } from "../types/telemetry";

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
  onDiagnostic?: (message: string | null) => void;
}

export interface TelemetryClient {
  fetchHistory(request: HistoryRequest): Promise<TelemetryHistoryResponse>;
  connect(handlers: TelemetryClientHandlers): void;
  disconnect(): void;
}
