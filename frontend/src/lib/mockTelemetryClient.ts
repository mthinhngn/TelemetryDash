import type {
  AlertEvent,
  AlertSeverity,
  TelemetryHistoryResponse,
  TelemetryReading,
} from "../types/telemetry";
import type {
  HistoryRequest,
  TelemetryClient,
  TelemetryClientHandlers,
} from "./telemetryClient";

interface SimulationState {
  currentId: number;
  currentTsMs: number;
  lapNumber: number;
  lapDistanceM: number;
}

const TRACK_LENGTH_METERS = 2_200;
const SAMPLE_INTERVAL_MS = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

function wave(index: number, offset: number, amplitude: number, period: number): number {
  return Math.sin((index + offset) / period) * amplitude;
}

function createSimulationState(now = Date.now()): SimulationState {
  return {
    currentId: 1,
    currentTsMs: now,
    lapNumber: 4,
    lapDistanceM: 1_050,
  };
}

function nextReading(state: SimulationState): TelemetryReading {
  const tick = state.currentId;
  const speed_kph = clamp(108 + wave(tick, 0, 28, 23) + wave(tick, 6, 8, 7), 48, 166);
  const lapDistanceM =
    state.lapDistanceM + (speed_kph * 1000) / 3600 / 10 > TRACK_LENGTH_METERS
      ? 0
      : state.lapDistanceM + (speed_kph * 1000) / 3600 / 10;
  const lapNumber =
    lapDistanceM === 0 ? state.lapNumber + 1 : state.lapNumber;
  const simulator_ts = new Date(state.currentTsMs).toISOString();
  const battery_soc_pct = clamp(78 - tick * 0.015 + wave(tick, 2, 0.4, 21), 12, 80);
  const battery_voltage_v = clamp(402 - tick * 0.01 + wave(tick, 1, 1.3, 19), 378, 404);
  const battery_current_a = clamp(115 + wave(tick, 0, 26, 9), 42, 186);
  const motor_temp_c = clamp(63 + wave(tick, 3, 11, 25), 49, 84);
  const inverter_temp_c = clamp(59 + wave(tick, 5, 9, 27), 47, 82);
  const coolant_temp_c = clamp(46 + wave(tick, 7, 6, 29), 36, 66);
  const throttle_pct = clamp(56 + wave(tick, 1, 34, 15), 0, 100);
  const brake_pct = clamp(lapDistanceM > 1_500 ? 12 + wave(tick, 2, 10, 8) : 0, 0, 44);
  const brakePressureFront = clamp(brake_pct * 1.6, 0, 72);
  const brakePressureRear = clamp(brake_pct * 1.2, 0, 56);

  const reading: TelemetryReading = {
    id: state.currentId,
    simulator_ts,
    vehicle_id: "sim-01",
    lap_number: lapNumber,
    lap_distance_m: round(lapDistanceM, 1),
    speed_kph: round(speed_kph, 1),
    acceleration_x_g: round(wave(tick, 0, 0.18, 8), 3),
    acceleration_y_g: round(wave(tick, 4, 0.95, 18), 3),
    acceleration_z_g: round(1 + wave(tick, 1, 0.03, 11), 3),
    battery_soc_pct: round(battery_soc_pct, 1),
    battery_voltage_v: round(battery_voltage_v, 2),
    battery_current_a: round(battery_current_a, 1),
    battery_temp_c: round(clamp(38 + wave(tick, 5, 3.4, 31), 33, 52), 1),
    motor_rpm: Math.round(speed_kph * 82),
    motor_temp_c: round(motor_temp_c, 1),
    inverter_temp_c: round(inverter_temp_c, 1),
    coolant_temp_c: round(coolant_temp_c, 1),
    ambient_temp_c: round(clamp(24 + wave(tick, 6, 2.4, 41), 20, 31), 1),
    tire_fl_temp_c: round(clamp(63 + wave(tick, 1, 6, 17), 52, 78), 1),
    tire_fr_temp_c: round(clamp(64 + wave(tick, 3, 5.5, 18), 52, 78), 1),
    tire_rl_temp_c: round(clamp(58 + wave(tick, 5, 5.2, 20), 48, 73), 1),
    tire_rr_temp_c: round(clamp(59 + wave(tick, 7, 5.4, 19), 48, 73), 1),
    brake_pressure_front_bar: round(brakePressureFront, 1),
    brake_pressure_rear_bar: round(brakePressureRear, 1),
    steering_angle_deg: round(wave(tick, 2, 19, 10), 1),
    throttle_pct: round(throttle_pct, 1),
    brake_pct: round(brake_pct, 1),
    latitude_deg: 33.8812,
    longitude_deg: -117.8826,
    ingested_at: new Date(state.currentTsMs + 25).toISOString(),
  };

  state.currentId += 1;
  state.currentTsMs += SAMPLE_INTERVAL_MS;
  state.lapNumber = lapNumber;
  state.lapDistanceM = lapDistanceM;

  return reading;
}

function buildAlert(
  reading: TelemetryReading,
  severity: AlertSeverity,
  metric_name: string,
  metric_value: number,
  threshold_value: number,
  message: string,
): AlertEvent {
  return {
    id: reading.id,
    reading_id: reading.id,
    alert_type: metric_name,
    severity,
    metric_name,
    metric_value,
    threshold_value,
    message,
    occurred_at: reading.ingested_at,
  };
}

function evaluateAlerts(reading: TelemetryReading): AlertEvent[] {
  const alerts: AlertEvent[] = [];

  if (reading.motor_temp_c > 80) {
    alerts.push(
      buildAlert(
        reading,
        "critical",
        "motor_temp_c",
        reading.motor_temp_c,
        80,
        `Motor temperature critical at ${reading.motor_temp_c.toFixed(1)} C.`,
      ),
    );
  } else if (reading.motor_temp_c > 70) {
    alerts.push(
      buildAlert(
        reading,
        "warning",
        "motor_temp_c",
        reading.motor_temp_c,
        70,
        `Motor temperature warning at ${reading.motor_temp_c.toFixed(1)} C.`,
      ),
    );
  }

  if (reading.inverter_temp_c > 80) {
    alerts.push(
      buildAlert(
        reading,
        "critical",
        "inverter_temp_c",
        reading.inverter_temp_c,
        80,
        `Inverter temperature critical at ${reading.inverter_temp_c.toFixed(1)} C.`,
      ),
    );
  } else if (reading.inverter_temp_c > 70) {
    alerts.push(
      buildAlert(
        reading,
        "warning",
        "inverter_temp_c",
        reading.inverter_temp_c,
        70,
        `Inverter temperature warning at ${reading.inverter_temp_c.toFixed(1)} C.`,
      ),
    );
  }

  if (reading.battery_soc_pct < 10) {
    alerts.push(
      buildAlert(
        reading,
        "critical",
        "battery_soc_pct",
        reading.battery_soc_pct,
        10,
        `Battery state of charge critical at ${reading.battery_soc_pct.toFixed(1)}%.`,
      ),
    );
  } else if (reading.battery_soc_pct < 20) {
    alerts.push(
      buildAlert(
        reading,
        "warning",
        "battery_soc_pct",
        reading.battery_soc_pct,
        20,
        `Battery state of charge low at ${reading.battery_soc_pct.toFixed(1)}%.`,
      ),
    );
  }

  return alerts;
}

function buildHistory(minutes: number, limit: number): TelemetryHistoryResponse {
  const sampleCount = Math.min(Math.floor((minutes * 60_000) / SAMPLE_INTERVAL_MS), limit);
  const state = createSimulationState(Date.now() - sampleCount * SAMPLE_INTERVAL_MS);
  const readings: TelemetryReading[] = [];
  const alerts: AlertEvent[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const reading = nextReading(state);
    readings.push(reading);
    alerts.push(...evaluateAlerts(reading));
  }

  return {
    minutes,
    count: readings.length,
    readings,
    alerts: alerts.slice(-10),
  };
}

export class MockTelemetryClient implements TelemetryClient {
  private handlers: TelemetryClientHandlers | null = null;
  private intervalId: number | null = null;
  private liveState = createSimulationState();
  private historyCache = buildHistory(5, 600);

  async fetchHistory({ minutes, limit }: HistoryRequest): Promise<TelemetryHistoryResponse> {
    const history = buildHistory(minutes, limit);
    this.historyCache = history;
    const lastReading = history.readings.at(-1);

    if (lastReading) {
      this.liveState = createSimulationState(new Date(lastReading.simulator_ts).getTime());
      this.liveState.currentId = lastReading.id + 1;
      this.liveState.lapNumber = lastReading.lap_number;
      this.liveState.lapDistanceM = lastReading.lap_distance_m;
    }

    return history;
  }

  connect(handlers: TelemetryClientHandlers): void {
    this.disconnect();
    this.handlers = handlers;
    handlers.onStatusChange?.("connecting");

    window.setTimeout(() => {
      if (!this.handlers) {
        return;
      }

      handlers.onStatusChange?.("connected");
      handlers.onMessage({
        type: "snapshot",
        readings: this.historyCache.readings.slice(-100),
      });

      this.intervalId = window.setInterval(() => {
        if (!this.handlers) {
          return;
        }

        const reading = nextReading(this.liveState);
        handlers.onMessage({ type: "telemetry", reading });

        for (const alert of evaluateAlerts(reading)) {
          handlers.onMessage({ type: "alert", alert });
        }
      }, SAMPLE_INTERVAL_MS);
    }, 120);
  }

  disconnect(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.handlers = null;
  }
}
