import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  AlertEvent,
  HistorySnapshot,
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
  disconnectCalls = 0;
  fetchRequest: HistoryRequest | null = null;

  constructor(private readonly historyProvider: () => Promise<HistorySnapshot>) {}

  fetchHistory(request: HistoryRequest): Promise<HistorySnapshot> {
    this.fetchRequest = request;
    return this.historyProvider();
  }

  connect(handlers: TelemetryClientHandlers): void {
    this.connectCalls += 1;
    this.handlers = handlers;
    handlers.onStatusChange?.("connecting");
  }

  disconnect(): void {
    this.disconnectCalls += 1;
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
    timestamp: "2025-03-14T10:00:00.100Z",
    lap: 3,
    distance_m: 1240.5,
    speed_kmh: 87.4,
    motor_rpm: 7200,
    throttle_pct: 62,
    brake_pct: 0,
    torque_command_nm: 230,
    torque_feedback_nm: 218.5,
    power_requested_kw: 72,
    power_actual_kw: 68.5,
    power_limit_target_kw: 70,
    pack_voltage_v: 396.2,
    pack_current_a: 173,
    battery_soc_pct: 74.1,
    motor_temp_c: 67.3,
    inverter_temp_c: 61.8,
    gate_driver_temp_c: 58.4,
    battery_temp_c: 38.2,
    highest_cell_temp_c: 41.7,
    cell_voltage_high_v: 4.08,
    cell_voltage_low_v: 3.94,
    cell_delta_v: 0.14,
    lap_energy_wh: 182,
    total_energy_kwh: 1.92,
    carry_over_wh: 68,
    rad_fan_active: true,
    battery_fan_active: false,
    ...overrides,
  };
}

function buildAlert(
  overrides: Partial<AlertEvent> & Pick<AlertEvent, "id" | "message">,
): AlertEvent {
  return {
    timestamp: "2025-03-14T10:00:01.100Z",
    metric: "motor_temp_c",
    value: 72.3,
    level: "warning",
    ...overrides,
  };
}

describe("Telemetry dashboard", () => {
  it("renders a connecting state while history is loading", () => {
    const deferred = new Deferred<HistorySnapshot>();
    const client = new FakeTelemetryClient(() => deferred.promise);

    render(<App client={client} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to telemetry stream...",
    );
  });

  it("updates live cards when telemetry events arrive", async () => {
    const client = new FakeTelemetryClient(async () => ({
      readings: [buildReading()],
      alerts: [],
    }));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      client.emit({
        type: "telemetry",
        reading: buildReading({
          timestamp: "2025-03-14T10:00:02.100Z",
          speed_kmh: 121.4,
          power_actual_kw: 74.2,
        }),
      });
    });

    expect(screen.getByText("121.4")).toBeInTheDocument();
    expect(screen.getByText("74.2")).toBeInTheDocument();
  });

  it("prepends alerts and caps the alert feed at ten items", async () => {
    const client = new FakeTelemetryClient(async () => ({
      readings: [buildReading()],
      alerts: [],
    }));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      for (let index = 0; index < 12; index += 1) {
        client.emit({
          type: "alert",
          alert: buildAlert({
            id: `alert-${index}`,
            message: `Alert ${index}`,
            timestamp: `2025-03-14T10:00:${String(index).padStart(2, "0")}.000Z`,
          }),
        });
      }
    });

    expect(screen.getByText("Alert 11")).toBeInTheDocument();
    expect(screen.queryByText("Alert 0")).not.toBeInTheDocument();
    expect(screen.getByTestId("alert-count")).toHaveTextContent("10");
  });

  it("shows reconnecting state and retries after disconnect", async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeTelemetryClient(async () => ({
        readings: [buildReading()],
        alerts: [],
      }));

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

  it("seeds the dashboard from history_init messages", async () => {
    const client = new FakeTelemetryClient(async () => ({
      readings: [],
      alerts: [],
    }));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      client.emit({
        type: "history_init",
        readings: [
          buildReading({ timestamp: "2025-03-14T10:00:01.000Z", speed_kmh: 91.1 }),
          buildReading({ timestamp: "2025-03-14T10:00:02.000Z", speed_kmh: 93.8 }),
        ],
        alerts: [buildAlert({ id: "history-alert", message: "History alert" })],
      });
    });

    expect(screen.getByTestId("sample-count")).toHaveTextContent("2");
    expect(screen.getByText("93.8")).toBeInTheDocument();
    expect(screen.getByText("History alert")).toBeInTheDocument();
  });

  it("caps the chart buffer at 600 readings", async () => {
    const client = new FakeTelemetryClient(async () => ({
      readings: [],
      alerts: [],
    }));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    act(() => {
      client.setStatus("connected");
      for (let index = 0; index < 650; index += 1) {
        client.emit({
          type: "telemetry",
          reading: buildReading({
            timestamp: `2025-03-14T10:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
            speed_kmh: 80 + index,
          }),
        });
      }
    });

    expect(screen.getByTestId("sample-count")).toHaveTextContent("600");
  });

  it("renders the dashboard sections together without crashing", async () => {
    const client = new FakeTelemetryClient(async () => ({
      readings: [buildReading()],
      alerts: [buildAlert({ id: "seed-alert", message: "Seed alert" })],
    }));

    render(<App client={client} />);

    await waitFor(() => expect(client.connectCalls).toBe(1));

    expect(screen.getByRole("heading", { name: "TelemetryDash" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alert Feed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Power Envelope" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Highest Cell Temperature" }),
    ).toBeInTheDocument();
  });
});
