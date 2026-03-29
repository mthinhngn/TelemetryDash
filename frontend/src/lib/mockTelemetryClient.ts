import {
  type AlertEvent,
  type AlertLevel,
  type HistorySnapshot,
  type TelemetryReading,
} from "../types/telemetry";
import type {
  HistoryRequest,
  TelemetryClient,
  TelemetryClientHandlers,
} from "./telemetryClient";

interface SimulationState {
  tick: number;
  timestampMs: number;
  lap: number;
  distance_m: number;
  total_energy_kwh: number;
}

interface ThresholdDefinition {
  metric: keyof TelemetryReading;
  level: AlertLevel;
  isTriggered: (reading: TelemetryReading) => boolean;
  buildMessage: (reading: TelemetryReading) => string;
  value: (reading: TelemetryReading) => number;
}

const TRACK_LENGTH_METERS = 2_200;
const SAMPLE_INTERVAL_MS = 100;

const thresholdDefinitions: ThresholdDefinition[] = [
  {
    metric: "torque_feedback_nm",
    level: "warning",
    isTriggered: (reading) =>
      Math.abs(reading.torque_command_nm - reading.torque_feedback_nm) > 10,
    buildMessage: (reading) =>
      `Torque mismatch detected (${(reading.torque_command_nm - reading.torque_feedback_nm).toFixed(1)} Nm delta).`,
    value: (reading) =>
      Math.abs(reading.torque_command_nm - reading.torque_feedback_nm),
  },
  {
    metric: "power_actual_kw",
    level: "warning",
    isTriggered: (reading) => reading.power_actual_kw > 70,
    buildMessage: (reading) =>
      `Power draw elevated at ${reading.power_actual_kw.toFixed(1)} kW.`,
    value: (reading) => reading.power_actual_kw,
  },
  {
    metric: "power_actual_kw",
    level: "critical",
    isTriggered: (reading) => reading.power_actual_kw > 75,
    buildMessage: (reading) =>
      `Power draw critical at ${reading.power_actual_kw.toFixed(1)} kW.`,
    value: (reading) => reading.power_actual_kw,
  },
  {
    metric: "battery_soc_pct",
    level: "warning",
    isTriggered: (reading) => reading.battery_soc_pct < 20,
    buildMessage: (reading) =>
      `Battery state of charge low at ${reading.battery_soc_pct.toFixed(1)}%.`,
    value: (reading) => reading.battery_soc_pct,
  },
  {
    metric: "battery_soc_pct",
    level: "critical",
    isTriggered: (reading) => reading.battery_soc_pct < 10,
    buildMessage: (reading) =>
      `Battery state of charge critical at ${reading.battery_soc_pct.toFixed(1)}%.`,
    value: (reading) => reading.battery_soc_pct,
  },
  {
    metric: "cell_delta_v",
    level: "warning",
    isTriggered: (reading) => reading.cell_delta_v > 0.5,
    buildMessage: (reading) =>
      `Cell voltage spread warning at ${reading.cell_delta_v.toFixed(2)} V.`,
    value: (reading) => reading.cell_delta_v,
  },
  {
    metric: "cell_delta_v",
    level: "critical",
    isTriggered: (reading) => reading.cell_delta_v > 1,
    buildMessage: (reading) =>
      `Cell voltage spread critical at ${reading.cell_delta_v.toFixed(2)} V.`,
    value: (reading) => reading.cell_delta_v,
  },
  {
    metric: "cell_voltage_low_v",
    level: "warning",
    isTriggered: (reading) => reading.cell_voltage_low_v < 3.2,
    buildMessage: (reading) =>
      `Lowest cell voltage dipped to ${reading.cell_voltage_low_v.toFixed(2)} V.`,
    value: (reading) => reading.cell_voltage_low_v,
  },
  {
    metric: "highest_cell_temp_c",
    level: "warning",
    isTriggered: (reading) => reading.highest_cell_temp_c > 55,
    buildMessage: (reading) =>
      `Highest cell temperature warning at ${reading.highest_cell_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.highest_cell_temp_c,
  },
  {
    metric: "motor_temp_c",
    level: "warning",
    isTriggered: (reading) => reading.motor_temp_c > 70,
    buildMessage: (reading) =>
      `Motor temperature warning at ${reading.motor_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.motor_temp_c,
  },
  {
    metric: "motor_temp_c",
    level: "critical",
    isTriggered: (reading) => reading.motor_temp_c > 80,
    buildMessage: (reading) =>
      `Motor temperature critical at ${reading.motor_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.motor_temp_c,
  },
  {
    metric: "gate_driver_temp_c",
    level: "warning",
    isTriggered: (reading) => reading.gate_driver_temp_c > 70,
    buildMessage: (reading) =>
      `Gate driver temperature warning at ${reading.gate_driver_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.gate_driver_temp_c,
  },
  {
    metric: "gate_driver_temp_c",
    level: "critical",
    isTriggered: (reading) => reading.gate_driver_temp_c > 80,
    buildMessage: (reading) =>
      `Gate driver temperature critical at ${reading.gate_driver_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.gate_driver_temp_c,
  },
  {
    metric: "inverter_temp_c",
    level: "warning",
    isTriggered: (reading) => reading.inverter_temp_c > 70,
    buildMessage: (reading) =>
      `Inverter temperature warning at ${reading.inverter_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.inverter_temp_c,
  },
  {
    metric: "inverter_temp_c",
    level: "critical",
    isTriggered: (reading) => reading.inverter_temp_c > 80,
    buildMessage: (reading) =>
      `Inverter temperature critical at ${reading.inverter_temp_c.toFixed(1)} C.`,
    value: (reading) => reading.inverter_temp_c,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

function wave(tick: number, offset: number, amplitude: number, period: number): number {
  return Math.sin((tick + offset) / period) * amplitude;
}

function jitter(tick: number, salt: number, amplitude: number): number {
  const raw = Math.sin((tick + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return (raw - Math.floor(raw) - 0.5) * amplitude * 2;
}

function nextReading(state: SimulationState): TelemetryReading {
  const tick = state.tick;
  const speedBase = 108 + wave(tick, 0, 28, 23) + wave(tick, 4, 12, 7);
  const speed_kmh = clamp(speedBase + jitter(tick, 1, 2.5), 42, 168);
  const deltaDistance = (speed_kmh * 1000) / 3600 / 10;
  const rawDistance = state.distance_m + deltaDistance;
  const lap = rawDistance >= TRACK_LENGTH_METERS ? state.lap + 1 : state.lap;
  const distance_m =
    rawDistance >= TRACK_LENGTH_METERS ? rawDistance - TRACK_LENGTH_METERS : rawDistance;
  const lapPhase = distance_m / TRACK_LENGTH_METERS;
  const throttle_pct = clamp(
    54 + wave(tick, 8, 36, 17) + jitter(tick, 2, 4),
    0,
    100,
  );
  const brake_pct = clamp(
    lapPhase > 0.65 && lapPhase < 0.82 ? 10 + wave(tick, 2, 12, 6) : 0,
    0,
    45,
  );
  const motor_rpm = Math.round(speed_kmh * 83 + wave(tick, 3, 220, 11));
  const torque_command_nm = round(clamp(throttle_pct * 3.8 - brake_pct * 1.4, 40, 320));
  const mismatchBias = tick % 110 > 92 ? 14 : 5.5;
  const torque_feedback_nm = round(
    clamp(
      torque_command_nm - mismatchBias + wave(tick, 5, 6, 9) + jitter(tick, 4, 1.4),
      25,
      315,
    ),
  );
  const power_requested_kw = round(clamp(speed_kmh * 0.58 + throttle_pct * 0.28, 24, 84));
  const power_actual_kw = round(
    clamp(
      power_requested_kw - 2 + wave(tick, 7, 3.8, 5) + (tick % 140 > 110 ? 6 : 0),
      18,
      82,
    ),
  );
  const power_limit_target_kw = round(
    clamp(72 - wave(tick, 1, 4, 29) - (tick % 200 > 140 ? 2.5 : 0), 65, 74),
  );
  const pack_voltage_v = round(
    clamp(402 - state.total_energy_kwh * 1.8 + wave(tick, 3, 1.6, 19), 378, 404),
    2,
  );
  const pack_current_a = round(clamp((power_actual_kw * 1000) / pack_voltage_v, 42, 208), 1);
  const battery_soc_pct = round(
    clamp(82 - state.total_energy_kwh * 3.3 + wave(tick, 2, 0.7, 41), 8, 84),
    1,
  );
  const motor_temp_c = round(
    clamp(64 + power_actual_kw * 0.12 + wave(tick, 2, 6, 37), 48, 86),
    1,
  );
  const inverter_temp_c = round(
    clamp(58 + power_actual_kw * 0.11 + wave(tick, 3, 5, 33), 45, 84),
    1,
  );
  const gate_driver_temp_c = round(
    clamp(55 + power_actual_kw * 0.09 + wave(tick, 5, 4, 31), 43, 82),
    1,
  );
  const battery_temp_c = round(
    clamp(36 + state.total_energy_kwh * 1.6 + wave(tick, 6, 2.2, 45), 30, 58),
    1,
  );
  const highest_cell_temp_c = round(
    clamp(battery_temp_c + 2.4 + wave(tick, 7, 1.5, 13), 32, 60),
    1,
  );
  const cell_delta_v = round(
    clamp(0.12 + wave(tick, 1, 0.05, 16) + (tick % 160 > 118 ? 0.47 : 0), 0.04, 1.1),
    2,
  );
  const cell_voltage_high_v = round(
    clamp(4.1 - state.total_energy_kwh * 0.02 + wave(tick, 9, 0.02, 23), 3.65, 4.12),
    2,
  );
  const cell_voltage_low_v = round(clamp(cell_voltage_high_v - cell_delta_v, 3.05, 4.05), 2);
  const lapEnergyBase = 130 + lapPhase * 120 + wave(tick, 4, 16, 14);
  const lap_energy_wh = round(clamp(lapEnergyBase, 70, 240), 1);
  const carry_over_wh = round(clamp(220 - lap_energy_wh, -90, 120), 1);
  const total_energy_kwh = round(
    state.total_energy_kwh + (power_actual_kw * (SAMPLE_INTERVAL_MS / 3_600_000)),
    3,
  );
  const rad_fan_active =
    inverter_temp_c > 67 || motor_temp_c > 68 || (tick % 130 > 30 && tick % 130 < 95);
  const battery_fan_active =
    highest_cell_temp_c > 48 || battery_temp_c > 45 || (tick % 180 > 120 && tick % 180 < 170);

  state.tick += 1;
  state.timestampMs += SAMPLE_INTERVAL_MS;
  state.lap = lap;
  state.distance_m = distance_m;
  state.total_energy_kwh = total_energy_kwh;

  return {
    timestamp: new Date(state.timestampMs).toISOString(),
    lap,
    distance_m: round(distance_m, 1),
    speed_kmh: round(speed_kmh, 1),
    motor_rpm,
    throttle_pct: round(throttle_pct, 1),
    brake_pct: round(brake_pct, 1),
    torque_command_nm,
    torque_feedback_nm,
    power_requested_kw,
    power_actual_kw,
    power_limit_target_kw,
    pack_voltage_v,
    pack_current_a,
    battery_soc_pct,
    motor_temp_c,
    inverter_temp_c,
    gate_driver_temp_c,
    battery_temp_c,
    highest_cell_temp_c,
    cell_voltage_high_v,
    cell_voltage_low_v,
    cell_delta_v,
    lap_energy_wh,
    total_energy_kwh,
    carry_over_wh,
    rad_fan_active,
    battery_fan_active,
  };
}

function buildFanAlerts(reading: TelemetryReading): AlertEvent[] {
  const alerts: AlertEvent[] = [];

  if ((reading.motor_temp_c > 70 || reading.inverter_temp_c > 70) && !reading.rad_fan_active) {
    alerts.push({
      id: `fan-rad-${reading.timestamp}`,
      timestamp: reading.timestamp,
      metric: "rad_fan_active",
      value: 0,
      level: "warning",
      message: "Powertrain temperatures are elevated while the radiator fan is OFF.",
    });
  }

  if (reading.highest_cell_temp_c > 55 && !reading.battery_fan_active) {
    alerts.push({
      id: `fan-batt-${reading.timestamp}`,
      timestamp: reading.timestamp,
      metric: "battery_fan_active",
      value: 0,
      level: "warning",
      message: "Battery cells are hot while the battery fan is OFF.",
    });
  }

  return alerts;
}

function evaluateAlerts(
  reading: TelemetryReading,
  previousLevels: Map<string, AlertLevel | null>,
): AlertEvent[] {
  const alerts: AlertEvent[] = [];
  const fanAlerts = buildFanAlerts(reading);

  for (const definition of thresholdDefinitions) {
    const key = `${definition.metric}:${definition.level}`;
    const isTriggered = definition.isTriggered(reading);
    const previousLevel = previousLevels.get(key);

    if (isTriggered && previousLevel !== definition.level) {
      previousLevels.set(key, definition.level);
      alerts.push({
        id: `${key}:${reading.timestamp}`,
        timestamp: reading.timestamp,
        metric: definition.metric,
        value: definition.value(reading),
        level: definition.level,
        message: definition.buildMessage(reading),
      });
    }

    if (!isTriggered && previousLevel === definition.level) {
      previousLevels.set(key, null);
    }
  }

  for (const alert of fanAlerts) {
    if (previousLevels.get(alert.metric) !== alert.level) {
      previousLevels.set(alert.metric, alert.level);
      alerts.push(alert);
    }
  }

  if (!fanAlerts.some((alert) => alert.metric === "rad_fan_active")) {
    previousLevels.set("rad_fan_active", null);
  }

  if (!fanAlerts.some((alert) => alert.metric === "battery_fan_active")) {
    previousLevels.set("battery_fan_active", null);
  }

  return alerts;
}

function createSimulationState(endTimestampMs = Date.now()): SimulationState {
  return {
    tick: 0,
    timestampMs: endTimestampMs,
    lap: 3,
    distance_m: 1_140,
    total_energy_kwh: 1.2,
  };
}

function buildSnapshot(minutes: number, limit: number): HistorySnapshot {
  const sampleCount = Math.min(Math.floor((minutes * 60_000) / SAMPLE_INTERVAL_MS), limit);
  const state = createSimulationState(Date.now() - sampleCount * SAMPLE_INTERVAL_MS);
  const alerts: AlertEvent[] = [];
  const previousLevels = new Map<string, AlertLevel | null>();
  const readings: TelemetryReading[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const reading = nextReading(state);
    readings.push(reading);
    alerts.push(...evaluateAlerts(reading, previousLevels));
  }

  return {
    readings,
    alerts: alerts.slice(-10),
  };
}

export class MockTelemetryClient implements TelemetryClient {
  private handlers: TelemetryClientHandlers | null = null;
  private intervalId: number | null = null;
  private liveState = createSimulationState();
  private historyCache = buildSnapshot(5, 600);
  private previousLevels = new Map<string, AlertLevel | null>();

  async fetchHistory({ minutes, limit }: HistoryRequest): Promise<HistorySnapshot> {
    const snapshot = buildSnapshot(minutes, limit);
    this.historyCache = snapshot;
    const lastReading = snapshot.readings.at(-1);

    if (lastReading) {
      this.liveState = createSimulationState(new Date(lastReading.timestamp).getTime());
      this.liveState.tick = snapshot.readings.length;
      this.liveState.lap = lastReading.lap;
      this.liveState.distance_m = lastReading.distance_m;
      this.liveState.total_energy_kwh = lastReading.total_energy_kwh;
    }

    return snapshot;
  }

  connect(handlers: TelemetryClientHandlers): void {
    this.disconnect();
    this.handlers = handlers;
    this.handlers.onStatusChange?.("connecting");

    window.setTimeout(() => {
      if (!this.handlers) {
        return;
      }

      this.handlers.onStatusChange?.("connected");
      this.handlers.onMessage({
        type: "history_init",
        readings: this.historyCache.readings.slice(-100),
        alerts: this.historyCache.alerts.slice(-10),
      });

      this.intervalId = window.setInterval(() => {
        if (!this.handlers) {
          return;
        }

        const reading = nextReading(this.liveState);
        this.handlers.onMessage({ type: "telemetry", reading });

        for (const alert of evaluateAlerts(reading, this.previousLevels)) {
          this.handlers.onMessage({ type: "alert", alert });
        }
      }, SAMPLE_INTERVAL_MS);
    }, 150);
  }

  disconnect(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.handlers = null;
  }
}
