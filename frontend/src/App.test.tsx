import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  AlertEvent,
  TelemetryHistoryResponse,
  TelemetryReading,
  TelemetryStreamMessage,
} from "./types/telemetry";
import type {
  HistoryRequest,
  TelemetryClient,
  TelemetryClientHandlers,
} from "./lib/telemetryClient";

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
  }
}

class FakeTelemetryClient implements TelemetryClient {
  handlers: TelemetryClientHandlers | null = null;
  connectCalls = 0;
  fetchRequest: HistoryRequest | null = null;

  constructor(private readonly historyProvider: () => Promise<TelemetryHistoryResponse>) {}

  fetchHistory(request: HistoryRequest): Promise<TelemetryHistoryResponse> {
    this.fetchRequest = request;
    return this.historyProvider();
  }

  connect(handlers: TelemetryClientHandlers): void {
    this.connectCalls += 1;
    this.handlers = handlers;
    handlers.onStatusChange?.("connecting");
  }

  disconnect(): void {
    this.handlers = null;
  }

  setStatus(status: "connecting" | "connected" | "disconnected"): void {
    this.handlers?.onStatusChange?.(status);
  }

  emit(message: TelemetryStreamMessage): void {
    this.handlers?.onMessage(message);
  }
}

function buildReading(overrides: Partial<TelemetryReading> = {}): TelemetryReading {
  return {
    id: 1,
    simulator_ts: "2025-03-14T10:00:00.100Z",
    vehicle_id: "sim-01",
    lap_number: 3,
    lap_distance_m: 1240.5,
    speed_kph: 87.4,
    acceleration_x_g: 0.11,
    acceleration_y_g: 0.42,
    acceleration_z_g: 1.01,
    battery_soc_pct: 74.1,
    battery_voltage_v: 396.2,
    battery_current_a: 173,
    battery_temp_c: 38.2,
    motor_rpm: 7200,
    motor_temp_c: 67.3,
    inverter_temp_c: 61.8,
    coolant_temp_c: 45.4,
    ambient_temp_c: 24.1,
    tire_fl_temp_c: 61.1,
    tire_fr_temp_c: 60.7,
    tire_rl_temp_c: 57.2,
    tire_rr_temp_c: 57.6,
    brake_pressure_front_bar: 0,
    brake_pressure_rear_bar: 0,
    steering_angle_deg: 4.2,
    throttle_pct: 62,
    brake_pct: 0,
    latitude_deg: 33.8812,
    longitude_deg: -117.8826,
    ingested_at: "2025-03-14T10:00:00.130Z",
    ...overrides,
  };
}

function buildAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: 1,
    reading_id: 1,
    alert_type: "thermal",
    severity: "warning",
    metric_name: "motor_temp_c",
    metric_value: 72.3,
    threshold_value: 70,
    message: "Motor temperature warning at 72.3 C.",
    occurred_at: "2025-03-14T10:00:01.130Z",
    ...overrides,
  };
}

function buildHistory(
  readings: TelemetryReading[],
  alerts: AlertEvent[] = [],
  minutes = 5,
): TelemetryHistoryResponse {
  return {
    minutes,
    count: readings.length,
    readings,
    alerts,
  };
}

describe("Telemetry dashboard", () => {
  it("renders a connecting state while history is loading", () => {
    const deferred = new Deferred<TelemetryHistoryResponse>();
    const client = new FakeTelemetryClient(() => deferred.promise);

    render(<App client={client} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to telemetry stream...",
    );
  });

  it("loads initial history from fetchHistory", async () => {
    const client = new FakeTelemetryClient(async () =>
      buildHistory([buildReading({ speed_kph: 99.4, id: 7 })]),
    );

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    expect(screen.getByText("99.4")).toBeInTheDocument();
    expect(client.fetchRequest).toEqual({ minutes: 5, limit: 1000 });
  });

  it("merges socket snapshot payloads into dashboard state", async () => {
    const client = new FakeTelemetryClient(async () => buildHistory([]));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      client.emit({
        type: "snapshot",
        readings: [
          buildReading({ id: 10, simulator_ts: "2025-03-14T10:00:01.000Z", speed_kph: 91.1 }),
          buildReading({ id: 11, simulator_ts: "2025-03-14T10:00:02.000Z", speed_kph: 93.8 }),
        ],
      });
    });

    expect(screen.getByTestId("sample-count")).toHaveTextContent("2");
    expect(screen.getByText("93.8")).toBeInTheDocument();
  });

  it("updates live metric cards on telemetry messages", async () => {
    const client = new FakeTelemetryClient(async () => buildHistory([buildReading()]));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      client.emit({
        type: "telemetry",
        reading: buildReading({
          id: 2,
          simulator_ts: "2025-03-14T10:00:02.100Z",
          speed_kph: 121.4,
          throttle_pct: 78.1,
          brake_pct: 12.4,
        }),
      });
    });

    expect(screen.getByText("121.4")).toBeInTheDocument();
    expect(screen.getByText("Brake 12.4%")).toBeInTheDocument();
  });

  it("prepends backend alerts and caps the feed at ten items", async () => {
    const client = new FakeTelemetryClient(async () => buildHistory([buildReading()]));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      for (let index = 0; index < 12; index += 1) {
        client.emit({
          type: "alert",
          alert: buildAlert({
            id: index + 1,
            message: `Alert ${index}`,
            occurred_at: `2025-03-14T10:00:${String(index).padStart(2, "0")}.000Z`,
          }),
        });
      }
    });

    expect(screen.getByText("Alert 11")).toBeInTheDocument();
    expect(screen.queryByText("Alert 0")).not.toBeInTheDocument();
    expect(screen.getByTestId("alert-count")).toHaveTextContent("10");
  });

  it("retries after disconnect", async () => {
    vi.useFakeTimers();

    try {
      const client = new FakeTelemetryClient(async () => buildHistory([buildReading()]));

      await act(async () => {
        render(<App client={client} />);
        await Promise.resolve();
      });

      expect(client.connectCalls).toBe(1);

      act(() => {
        client.setStatus("connected");
        client.setStatus("disconnected");
      });

      expect(screen.getByRole("status")).toHaveTextContent(
        "Reconnecting to telemetry stream...",
      );

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(client.connectCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders against backend-shaped history and live socket data", async () => {
    const client = new FakeTelemetryClient(async () =>
      buildHistory(
        [buildReading({ id: 4, speed_kph: 102.2 })],
        [buildAlert({ id: 99, metric_name: "battery_soc_pct", severity: "warning" })],
      ),
    );

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      client.emit({
        type: "snapshot",
        readings: [buildReading({ id: 5, simulator_ts: "2025-03-14T10:00:03.000Z", motor_rpm: 7450 })],
      });
    });

    expect(screen.getByRole("heading", { name: "Speed Trend" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Battery Electrical" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Driver Inputs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alert Feed" })).toBeInTheDocument();
  });
});
