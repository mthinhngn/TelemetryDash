export type AlertSeverity = "warning" | "critical";

export interface TelemetryReading {
  id: number;
  simulator_ts: string;
  vehicle_id: string;
  lap_number: number;
  lap_distance_m: number;
  speed_kph: number;
  acceleration_x_g: number;
  acceleration_y_g: number;
  acceleration_z_g: number;
  battery_soc_pct: number;
  battery_voltage_v: number;
  battery_current_a: number;
  battery_temp_c: number;
  motor_rpm: number;
  motor_temp_c: number;
  inverter_temp_c: number;
  coolant_temp_c: number;
  ambient_temp_c: number;
  tire_fl_temp_c: number;
  tire_fr_temp_c: number;
  tire_rl_temp_c: number;
  tire_rr_temp_c: number;
  brake_pressure_front_bar: number;
  brake_pressure_rear_bar: number;
  steering_angle_deg: number;
  throttle_pct: number;
  brake_pct: number;
  latitude_deg: number;
  longitude_deg: number;
  ingested_at: string;
}

export type TelemetryInputPayload = Omit<TelemetryReading, "id" | "ingested_at">;
export type TelemetryInputFormValues = Omit<TelemetryInputPayload, "simulator_ts">;

export interface AlertEvent {
  id: number;
  reading_id: number;
  alert_type: string;
  severity: AlertSeverity;
  metric_name: string;
  metric_value: number;
  threshold_value: number;
  message: string;
  occurred_at: string;
}

export interface SnapshotMessage {
  type: "snapshot";
  readings: TelemetryReading[];
}

export interface LiveTelemetryMessage {
  type: "telemetry";
  reading: TelemetryReading;
}

export interface LiveAlertMessage {
  type: "alert";
  alert: AlertEvent;
}

export type TelemetryStreamMessage =
  | SnapshotMessage
  | LiveTelemetryMessage
  | LiveAlertMessage;

export interface TelemetryHistoryResponse {
  minutes: number;
  count: number;
  readings: TelemetryReading[];
  alerts: AlertEvent[];
}
