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
  private connectTimeoutId: number | null = null;

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
    handlers.onDiagnostic?.(`Opening WebSocket: ${appConfig.wsUrl}`);
    console.info("[telemetry] opening websocket", {
      apiUrl: appConfig.apiUrl,
      wsUrl: appConfig.wsUrl,
    });

    const socket = new WebSocket(appConfig.wsUrl);
    this.socket = socket;
    this.connectTimeoutId = window.setTimeout(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.CONNECTING) {
        return;
      }

      handlers.onDiagnostic?.(
        `WebSocket handshake timed out after ${appConfig.websocketConnectTimeoutMs} ms (${appConfig.wsUrl}).`,
      );
      handlers.onStatusChange?.("disconnected");
      socket.close(4000, "connect-timeout");
    }, appConfig.websocketConnectTimeoutMs);

    socket.onopen = () => {
      if (this.connectTimeoutId !== null) {
        window.clearTimeout(this.connectTimeoutId);
        this.connectTimeoutId = null;
      }
      handlers.onDiagnostic?.(`WebSocket connected: ${appConfig.wsUrl}`);
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
      handlers.onDiagnostic?.(`WebSocket error while connecting to ${appConfig.wsUrl}.`);
      handlers.onError?.(event);
    };

    socket.onclose = (event) => {
      if (this.connectTimeoutId !== null) {
        window.clearTimeout(this.connectTimeoutId);
        this.connectTimeoutId = null;
      }
      handlers.onDiagnostic?.(
        `WebSocket closed (code ${event.code}, clean=${event.wasClean}, reason="${
          event.reason || "none"
        }").`,
      );
      handlers.onStatusChange?.("disconnected");
    };
  }

  disconnect(): void {
    if (this.connectTimeoutId !== null) {
      window.clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
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
