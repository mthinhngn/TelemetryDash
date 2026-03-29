import { appConfig } from "../config";
import type {
  TelemetryHistoryResponse,
  TelemetryStreamMessage,
} from "../types/telemetry";
import type {
  HistoryRequest,
  TelemetryClient,
  TelemetryClientHandlers,
} from "./telemetryClient";

export class ApiTelemetryClient implements TelemetryClient {
  private socket: WebSocket | null = null;

  async fetchHistory({ minutes, limit }: HistoryRequest): Promise<TelemetryHistoryResponse> {
    const response = await fetch(
      `${appConfig.apiUrl}/telemetry/history?minutes=${minutes}&limit=${limit}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch telemetry history (${response.status}).`);
    }

    const payload = (await response.json()) as TelemetryHistoryResponse;
    return payload;
  }

  connect(handlers: TelemetryClientHandlers): void {
    this.disconnect();
    handlers.onStatusChange?.("connecting");

    const socket = new WebSocket(appConfig.wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      handlers.onStatusChange?.("connected");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as TelemetryStreamMessage;
        handlers.onMessage(message);
      } catch (error) {
        handlers.onError?.(error);
      }
    };

    socket.onerror = (event) => {
      handlers.onError?.(event);
    };

    socket.onclose = () => {
      handlers.onStatusChange?.("disconnected");
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }
}
