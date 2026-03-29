import type { AlertEvent, HistorySnapshot, TelemetryReading } from "../types/telemetry";

const readingKey = (reading: TelemetryReading) =>
  `${reading.timestamp}:${reading.lap}:${reading.distance_m.toFixed(1)}`;

const alertKey = (alert: AlertEvent) => alert.id;

export function normalizeReadings(readings: TelemetryReading[]): TelemetryReading[] {
  return [...readings].sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
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
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    )
    .slice(0, maxItems);
}

export function normalizeHistory(
  snapshot: HistorySnapshot,
  chartBufferSize: number,
  alertLimit = 10,
): HistorySnapshot {
  return {
    readings: mergeReadings([], snapshot.readings, chartBufferSize),
    alerts: prependAlerts([], snapshot.alerts, alertLimit),
  };
}
