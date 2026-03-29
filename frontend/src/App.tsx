import { useDeferredValue, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { appConfig } from "./config";
import { AlertFeed } from "./components/AlertFeed";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { MetricCard } from "./components/MetricCard";
import { TelemetryInputPanel } from "./components/TelemetryInputPanel";
import { useTelemetryDashboard } from "./hooks/useTelemetryDashboard";
import { createTelemetryClient } from "./lib/createTelemetryClient";
import type { TelemetryClient } from "./lib/telemetryClient";
import type { AlertEvent, TelemetryReading } from "./types/telemetry";

const defaultClient = createTelemetryClient();

interface AppProps {
  client?: TelemetryClient;
}

type MetricSeverity = "normal" | "warning" | "critical";

interface ChartPanelProps {
  children: ReactNode;
  subtitle: string;
  title: string;
}

function formatMetricValue(value: number | null, digits = 1): string {
  if (value === null) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatTimestampLabel(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function metricSeverity(alerts: AlertEvent[], metricName: string): MetricSeverity {
  const latestAlert = alerts.find((alert) => alert.metric_name === metricName);

  if (!latestAlert) {
    return "normal";
  }

  const ageMs = Date.now() - new Date(latestAlert.occurred_at).getTime();
  return ageMs <= 15_000 ? latestAlert.severity : "normal";
}

function ChartPanel({ children, subtitle, title }: ChartPanelProps) {
  return (
    <section className="panel chart-panel" aria-labelledby={`${title}-heading`}>
      <div className="panel__header">
        <div>
          <h2 id={`${title}-heading`}>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="chart-panel__body">{children}</div>
    </section>
  );
}

function TelemetryChart({
  children,
  data,
}: {
  children: ReactNode;
  data: TelemetryReading[];
}) {
  if (data.length === 0) {
    return <div className="chart-empty-state">Waiting for telemetry data...</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(20, 33, 61, 0.08)" strokeDasharray="3 3" />
        <XAxis
          dataKey="simulator_ts"
          minTickGap={32}
          tickFormatter={formatTimestampLabel}
          stroke="#52606d"
        />
        <YAxis stroke="#52606d" width={48} />
        <Tooltip
          formatter={(value: number) => value.toFixed(1)}
          labelFormatter={(label) => formatTimestampLabel(String(label))}
        />
        <Legend />
        {children}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MetaPanel({ latestReading }: { latestReading: TelemetryReading | null }) {
  return (
    <section className="panel meta-panel" aria-labelledby="meta-panel-title">
      <div className="panel__header">
        <div>
          <h2 id="meta-panel-title">Trackside Context</h2>
          <p>Current operating context from the backend telemetry contract.</p>
        </div>
      </div>
      <div className="meta-grid">
        <div className="meta-item">
          <span>Vehicle ID</span>
          <strong>{latestReading?.vehicle_id ?? "--"}</strong>
        </div>
        <div className="meta-item">
          <span>Ambient Temp</span>
          <strong>{formatMetricValue(latestReading?.ambient_temp_c ?? null)} C</strong>
        </div>
        <div className="meta-item">
          <span>Coolant Temp</span>
          <strong>{formatMetricValue(latestReading?.coolant_temp_c ?? null)} C</strong>
        </div>
        <div className="meta-item">
          <span>Battery Temp</span>
          <strong>{formatMetricValue(latestReading?.battery_temp_c ?? null)} C</strong>
        </div>
        <div className="meta-item">
          <span>Front Brake Pressure</span>
          <strong>
            {formatMetricValue(latestReading?.brake_pressure_front_bar ?? null)} bar
          </strong>
        </div>
        <div className="meta-item">
          <span>Rear Brake Pressure</span>
          <strong>
            {formatMetricValue(latestReading?.brake_pressure_rear_bar ?? null)} bar
          </strong>
        </div>
      </div>
    </section>
  );
}

export default function App({ client = defaultClient }: AppProps) {
  const { alerts, connectionStatus, errorMessage, latestReading, readings } =
    useTelemetryDashboard(client);
  const deferredReadings = useDeferredValue(readings);
  const socSeverity = metricSeverity(alerts, "battery_soc_pct");
  const motorSeverity = metricSeverity(alerts, "motor_temp_c");
  const inverterSeverity = metricSeverity(alerts, "inverter_temp_c");

  return (
    <div className="app-shell">
      <div className="page-backdrop" />
      <main className="dashboard">
        <ConnectionBanner errorMessage={errorMessage} status={connectionStatus} />

        <header className="hero">
          <div>
            <p className="eyebrow">Backend-connected telemetry</p>
            <h1>TelemetryDash</h1>
            <p className="hero__copy">
              Live electric race car telemetry rendered directly from the FastAPI
              history and WebSocket contract, with backend-owned alerting preserved.
            </p>
          </div>
          <div className="hero__stats">
            <div>
              <span>Connection</span>
              <strong data-testid="connection-status">{connectionStatus}</strong>
            </div>
            <div>
              <span>Samples buffered</span>
              <strong data-testid="sample-count">{readings.length}</strong>
            </div>
            <div>
              <span>Alerts visible</span>
              <strong data-testid="alert-count">{alerts.length}</strong>
            </div>
          </div>
        </header>

        <TelemetryInputPanel apiUrl={appConfig.apiUrl} mockMode={appConfig.useMockData} />

        <section className="metric-grid" aria-label="Live telemetry metrics">
          <MetricCard
            label="Speed"
            value={formatMetricValue(latestReading?.speed_kph ?? null)}
            unit="km/h"
            detail="Backend speed_kph"
          />
          <MetricCard
            label="Lap / Distance"
            value={latestReading ? `L${latestReading.lap_number}` : "--"}
            detail={
              latestReading
                ? `${latestReading.lap_distance_m.toFixed(1)} m into current lap`
                : "Waiting for lap data"
            }
          />
          <MetricCard
            label="Battery SoC"
            value={formatMetricValue(latestReading?.battery_soc_pct ?? null)}
            unit="%"
            detail="State of charge"
            severity={socSeverity}
          />
          <MetricCard
            label="Motor Temp"
            value={formatMetricValue(latestReading?.motor_temp_c ?? null)}
            unit="C"
            detail="motor_temp_c"
            severity={motorSeverity}
          />
          <MetricCard
            label="Inverter Temp"
            value={formatMetricValue(latestReading?.inverter_temp_c ?? null)}
            unit="C"
            detail="inverter_temp_c"
            severity={inverterSeverity}
          />
          <MetricCard
            label="Throttle / Brake"
            value={formatMetricValue(latestReading?.throttle_pct ?? null)}
            unit="%"
            detail={
              latestReading
                ? `Brake ${latestReading.brake_pct.toFixed(1)}%`
                : "Waiting for driver inputs"
            }
          />
        </section>

        <section className="status-row" aria-label="Context and alerts">
          <MetaPanel latestReading={latestReading} />
          <AlertFeed alerts={alerts} />
        </section>

        <section className="charts-grid" aria-label="Telemetry charts">
          <ChartPanel
            title="Speed Trend"
            subtitle="Vehicle speed from simulator timestamps"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="speed_kph"
                stroke="#0b6e4f"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Speed"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Motor RPM"
            subtitle="Rotational speed from the backend telemetry stream"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="motor_rpm"
                stroke="#26547c"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="RPM"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Battery Electrical"
            subtitle="Pack voltage and current over time"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="battery_voltage_v"
                stroke="#118ab2"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Voltage"
              />
              <Line
                type="monotone"
                dataKey="battery_current_a"
                stroke="#f18f01"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Current"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Powertrain Temperatures"
            subtitle="Motor, inverter, and coolant temperature trends"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="motor_temp_c"
                stroke="#ef476f"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Motor"
              />
              <Line
                type="monotone"
                dataKey="inverter_temp_c"
                stroke="#f18f01"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Inverter"
              />
              <Line
                type="monotone"
                dataKey="coolant_temp_c"
                stroke="#06d6a0"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Coolant"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Battery SoC"
            subtitle="Charge depletion over the current history window"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="battery_soc_pct"
                stroke="#7353ba"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="SoC"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Brake Pressure"
            subtitle="Front and rear brake pressure from hydraulic sensors"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="brake_pressure_front_bar"
                stroke="#d62839"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Front"
              />
              <Line
                type="monotone"
                dataKey="brake_pressure_rear_bar"
                stroke="#ff7b54"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Rear"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Driver Inputs"
            subtitle="Throttle, brake, and steering angle from the backend payload"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="throttle_pct"
                stroke="#0b6e4f"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Throttle"
              />
              <Line
                type="monotone"
                dataKey="brake_pct"
                stroke="#f18f01"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Brake"
              />
              <Line
                type="monotone"
                dataKey="steering_angle_deg"
                stroke="#14213d"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Steering"
              />
            </TelemetryChart>
          </ChartPanel>
        </section>
      </main>
    </div>
  );
}
