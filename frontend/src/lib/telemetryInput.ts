import type { TelemetryInputFormValues, TelemetryInputPayload } from "../types/telemetry";

const BASE_LATITUDE = 33.8812;
const BASE_LONGITUDE = -117.8826;

function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickAlertChance(probability: number): boolean {
  return Math.random() < probability;
}

export function createDefaultTelemetryFormValues(): TelemetryInputFormValues {
  return {
    vehicle_id: "browser-manual",
    lap_number: 3,
    lap_distance_m: 1240.5,
    speed_kph: 87.4,
    acceleration_x_g: 0.08,
    acceleration_y_g: 0.41,
    acceleration_z_g: 1.01,
    battery_soc_pct: 74.1,
    battery_voltage_v: 396.2,
    battery_current_a: 173.0,
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
    latitude_deg: BASE_LATITUDE,
    longitude_deg: BASE_LONGITUDE,
  };
}

export function generateRandomTelemetryFormValues(): TelemetryInputFormValues {
  const alertMode = pickAlertChance(0.2);
  const speed_kph = round(between(58, 168), 1);
  const heavyBraking = pickAlertChance(0.18);
  const throttle_pct = round(heavyBraking ? between(4, 28) : between(34, 96), 1);
  const brake_pct = round(
    heavyBraking ? between(24, 76) : between(0, Math.max(8, 20 - throttle_pct / 8)),
    1,
  );
  const normalizedLoad = throttle_pct / 100 + speed_kph / 220;
  const battery_soc_pct = round(
    alertMode && pickAlertChance(0.35) ? between(7, 19) : between(26, 88),
    1,
  );
  const battery_voltage_v = round(404 - (100 - battery_soc_pct) * 0.26 + between(-1.2, 1.2), 2);
  const battery_current_a = round(normalizedLoad * 132 + between(18, 58), 1);
  const motor_rpm = Math.round(speed_kph * between(74, 89));
  const motor_temp_c = round(
    alertMode && pickAlertChance(0.55) ? between(71, 84) : 52 + normalizedLoad * 18 + between(0, 7),
    1,
  );
  const inverter_temp_c = round(
    alertMode && pickAlertChance(0.45)
      ? between(71, 83)
      : 48 + normalizedLoad * 16 + between(0, 6),
    1,
  );
  const coolant_temp_c = round(39 + normalizedLoad * 12 + between(0, 4), 1);
  const ambient_temp_c = round(between(19, 31), 1);
  const battery_temp_c = round(31 + normalizedLoad * 9 + between(0, 4), 1);
  const steering_angle_deg = round(between(-21, 21), 1);
  const brake_pressure_front_bar = round(brake_pct * between(1.2, 1.8), 1);
  const brake_pressure_rear_bar = round(brake_pct * between(0.9, 1.4), 1);
  const lap_distance_m = round(between(0, 2200), 1);
  const lap_number = Math.floor(between(1, 8));

  return {
    vehicle_id: `browser-${Math.floor(between(1, 9))}`,
    lap_number,
    lap_distance_m,
    speed_kph,
    acceleration_x_g: round((throttle_pct - brake_pct) / 120 + between(-0.08, 0.08), 3),
    acceleration_y_g: round(between(-1.3, 1.3), 3),
    acceleration_z_g: round(1 + between(-0.04, 0.04), 3),
    battery_soc_pct,
    battery_voltage_v,
    battery_current_a,
    battery_temp_c,
    motor_rpm,
    motor_temp_c,
    inverter_temp_c,
    coolant_temp_c,
    ambient_temp_c,
    tire_fl_temp_c: round(48 + normalizedLoad * 17 + between(0, 7), 1),
    tire_fr_temp_c: round(49 + normalizedLoad * 17 + between(0, 7), 1),
    tire_rl_temp_c: round(45 + normalizedLoad * 14 + between(0, 6), 1),
    tire_rr_temp_c: round(46 + normalizedLoad * 14 + between(0, 6), 1),
    brake_pressure_front_bar,
    brake_pressure_rear_bar,
    steering_angle_deg,
    throttle_pct,
    brake_pct,
    latitude_deg: round(BASE_LATITUDE + between(-0.0025, 0.0025), 6),
    longitude_deg: round(BASE_LONGITUDE + between(-0.0025, 0.0025), 6),
  };
}

export function buildTelemetrySubmitPayload(
  values: TelemetryInputFormValues,
): TelemetryInputPayload {
  return {
    simulator_ts: new Date().toISOString(),
    ...values,
  };
}
