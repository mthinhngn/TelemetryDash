export type AlertLevel = "warning" | "critical";

export interface TelemetryReading {
  timestamp: string;
  lap: number;
  distance_m: number;
  speed_kmh: number;
  motor_rpm: number;
  throttle_pct: number;
  brake_pct: number;
  torque_command_nm: number;
  torque_feedback_nm: number;
  power_requested_kw: number;
  power_actual_kw: number;
  power_limit_target_kw: number;
  pack_voltage_v: number;
  pack_current_a: number;
  battery_soc_pct: number;
  motor_temp_c: number;
  inverter_temp_c: number;
  gate_driver_temp_c: number;
  battery_temp_c: number;
  highest_cell_temp_c: number;
  cell_voltage_high_v: number;
  cell_voltage_low_v: number;
  cell_delta_v: number;
  lap_energy_wh: number;
  total_energy_kwh: number;
  carry_over_wh: number;
  rad_fan_active: boolean;
  battery_fan_active: boolean;
}

export interface AlertEvent {
  id: string;
  timestamp: string;
  metric: string;
  value: number;
  level: AlertLevel;
  message: string;
}

export interface HistoryInitMessage {
  type: "history_init";
  readings: TelemetryReading[];
  alerts: AlertEvent[];
}

export interface TelemetryMessage {
  type: "telemetry";
  reading: TelemetryReading;
}

export interface AlertMessage {
  type: "alert";
  alert: AlertEvent;
}

export type TelemetryStreamMessage =
  | HistoryInitMessage
  | TelemetryMessage
  | AlertMessage;

export interface HistorySnapshot {
  readings: TelemetryReading[];
  alerts: AlertEvent[];
}
