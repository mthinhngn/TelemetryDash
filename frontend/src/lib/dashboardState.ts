import type {
  AlertEvent,
  TelemetryHistoryResponse,
  TelemetryReading,
} from "../types/telemetry";

const readingKey = (reading: TelemetryReading) =>
  String(reading.id ?? reading.simulator_ts);

const alertKey = (alert: AlertEvent) => String(alert.id);

export function normalizeReadings(readings: TelemetryReading[]): TelemetryReading[] {
  return [...readings].sort(
    (left, right) =>
      new Date(left.simulator_ts).getTime() - new Date(right.simulator_ts).getTime(),
  );
}

export function mergeReadings(
  existing: TelemetryReading[],
  incoming: TelemetryReading[],
  maxItems: number,
): TelemetryReading[] {
  const map = new Map<string, TelemetryReading>();

  for (const reading of normalizeReadings([...existing, ...incoming])) {
    map.set(readingKey(reading), reading);
  }

  const merged = [...map.values()];
  return merged.slice(Math.max(0, merged.length - maxItems));
}

export function prependAlerts(
  existing: AlertEvent[],
  incoming: AlertEvent[],
  maxItems: number,
): AlertEvent[] {
  const map = new Map<string, AlertEvent>();

  for (const alert of [...incoming, ...existing]) {
    map.set(alertKey(alert), alert);
  }

  return [...map.values()]
    .sort(
      (left, right) =>
        new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime(),
    )
    .slice(0, maxItems);
}

export function normalizeHistory(
  snapshot: TelemetryHistoryResponse,
  chartBufferSize: number,
  alertLimit = 10,
): TelemetryHistoryResponse {
  return {
    ...snapshot,
    count: Math.min(snapshot.readings.length, chartBufferSize),
    readings: mergeReadings([], snapshot.readings, chartBufferSize),
    alerts: prependAlerts([], snapshot.alerts, alertLimit),
  };
}
