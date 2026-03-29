import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiTelemetryClient } from "./apiTelemetryClient";
import type { ConnectionStatus } from "./telemetryClient";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = 0;

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose:
    | ((event: CloseEvent) => void)
    | null = null;
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({
      code: code ?? 1000,
      reason: reason ?? "",
      wasClean: code === undefined || code === 1000,
    } as CloseEvent);
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitClose(code = 1006, reason = "closed", wasClean = false): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean } as CloseEvent);
  }
}

describe("ApiTelemetryClient", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it("transitions to connected on websocket open", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const client = new ApiTelemetryClient();
    const statuses: ConnectionStatus[] = [];
    const diagnostics: string[] = [];

    client.connect({
      onMessage: vi.fn(),
      onStatusChange: (status) => statuses.push(status),
      onDiagnostic: (message) => diagnostics.push(String(message)),
    });

    MockWebSocket.instances[0].emitOpen();

    expect(statuses).toEqual(["connecting", "connected"]);
    expect(diagnostics.at(-1)).toContain("WebSocket connected");
  });

  it("transitions to disconnected on websocket timeout", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const client = new ApiTelemetryClient();
    const statuses: ConnectionStatus[] = [];
    const diagnostics: string[] = [];

    client.connect({
      onMessage: vi.fn(),
      onStatusChange: (status) => statuses.push(status),
      onDiagnostic: (message) => diagnostics.push(String(message)),
    });

    vi.advanceTimersByTime(4000);

    expect(statuses).toContain("disconnected");
    expect(diagnostics.some((message) => message.includes("timed out"))).toBe(true);
    vi.useRealTimers();
  });

  it("records useful diagnostics on websocket error and close", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const client = new ApiTelemetryClient();
    const diagnostics: string[] = [];

    client.connect({
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
      onDiagnostic: (message) => diagnostics.push(String(message)),
      onError: vi.fn(),
    });

    MockWebSocket.instances[0].emitError();
    MockWebSocket.instances[0].emitClose(1006, "abnormal-close", false);

    expect(diagnostics.some((message) => message.includes("WebSocket error"))).toBe(true);
    expect(diagnostics.some((message) => message.includes("code 1006"))).toBe(true);
  });
});
