import { useDeferredValue, type ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { appConfig } from "./config";
import { AlertFeed } from "./components/AlertFeed";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { FanIndicator } from "./components/FanIndicator";
import { MetricCard } from "./components/MetricCard";
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

function metricSeverity(alerts: AlertEvent[], metric: string): MetricSeverity {
  const latestAlert = alerts.find((alert) => alert.metric === metric);

  if (!latestAlert) {
    return "normal";
  }

  const ageMs = Date.now() - new Date(latestAlert.timestamp).getTime();
  return ageMs <= 15_000 ? latestAlert.level : "normal";
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

function EmptyChartState() {
  return <div className="chart-empty-state">Waiting for telemetry data...</div>;
}

function TelemetryChart({
  children,
  data,
}: {
  children: ReactNode;
  data: TelemetryReading[];
}) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(20, 33, 61, 0.08)" strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          minTickGap={32}
          tickFormatter={formatTimestampLabel}
          stroke="#52606d"
        />
        <YAxis stroke="#52606d" width={42} />
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

export default function App({ client = defaultClient }: AppProps) {
  const { alerts, connectionStatus, errorMessage, latestReading, readings } =
    useTelemetryDashboard(client);
  const deferredReadings = useDeferredValue(readings);
  const powerSeverity = metricSeverity(alerts, "power_actual_kw");
  const socSeverity = metricSeverity(alerts, "battery_soc_pct");
  const motorSeverity = metricSeverity(alerts, "motor_temp_c");
  const inverterSeverity = metricSeverity(alerts, "inverter_temp_c");
  const cellSeverity = metricSeverity(alerts, "highest_cell_temp_c");

  return (
    <div className="app-shell">
      <div className="page-backdrop" />
      <main className="dashboard">
        <ConnectionBanner errorMessage={errorMessage} status={connectionStatus} />

        <header className="hero">
          <div>
            <p className="eyebrow">Race-day command center</p>
            <h1>TelemetryDash</h1>
            <p className="hero__copy">
              Live electric race car telemetry streaming at 10 Hz with backend-ready
              events, live alerts, and low-latency charts.
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

        <section className="metric-grid" aria-label="Live telemetry metrics">
          <MetricCard
            label="Speed"
            value={formatMetricValue(latestReading?.speed_kmh ?? null)}
            unit="km/h"
            detail="Current vehicle speed"
          />
          <MetricCard
            label="Lap / Distance"
            value={latestReading ? `L${latestReading.lap}` : "--"}
            detail={
              latestReading
                ? `${latestReading.distance_m.toFixed(1)} m into current lap`
                : "Waiting for lap data"
            }
          />
          <MetricCard
            label="Battery SoC"
            value={formatMetricValue(latestReading?.battery_soc_pct ?? null)}
            unit="%"
            detail="Remaining battery state of charge"
            severity={socSeverity}
          />
          <MetricCard
            label="Power Actual"
            value={formatMetricValue(latestReading?.power_actual_kw ?? null)}
            unit="kW"
            detail="Delivered power to the drivetrain"
            severity={powerSeverity}
          />
          <MetricCard
            label="Motor Temp"
            value={formatMetricValue(latestReading?.motor_temp_c ?? null)}
            unit="C"
            detail="Motor housing temperature"
            severity={motorSeverity}
          />
          <MetricCard
            label="Inverter Temp"
            value={formatMetricValue(latestReading?.inverter_temp_c ?? null)}
            unit="C"
            detail="Inverter temperature"
            severity={inverterSeverity}
          />
          <MetricCard
            label="Highest Cell Temp"
            value={formatMetricValue(latestReading?.highest_cell_temp_c ?? null)}
            unit="C"
            detail="Hottest battery cell temperature"
            severity={cellSeverity}
          />
        </section>

        <section className="status-row" aria-label="Cooling systems and live alerts">
          <div className="fan-grid">
            <FanIndicator
              label="Radiator Fan"
              active={latestReading?.rad_fan_active ?? false}
            />
            <FanIndicator
              label="Battery Fan"
              active={latestReading?.battery_fan_active ?? false}
            />
          </div>
          <AlertFeed alerts={alerts} />
        </section>

        <section className="charts-grid" aria-label="Telemetry charts">
          <ChartPanel
            title="Power Envelope"
            subtitle="Requested, delivered, and current power limit target"
          >
            <TelemetryChart data={deferredReadings}>
              <Area
                type="monotone"
                dataKey="power_limit_target_kw"
                fill="rgba(241, 143, 1, 0.16)"
                stroke="transparent"
                isAnimationActive={false}
                name="Power limit"
              />
              <Line
                type="monotone"
                dataKey="power_requested_kw"
                stroke="#0b6e4f"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Requested"
              />
              <Line
                type="monotone"
                dataKey="power_actual_kw"
                stroke="#f18f01"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Actual"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Torque Tracking"
            subtitle="Driver torque demand against measured torque feedback"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="torque_command_nm"
                stroke="#26547c"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Command"
              />
              <Line
                type="monotone"
                dataKey="torque_feedback_nm"
                stroke="#ef476f"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Feedback"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Lap Energy Budget"
            subtitle="Current lap energy draw versus fixed engineering target"
          >
            <TelemetryChart data={deferredReadings}>
              <ReferenceLine
                y={appConfig.lapEnergyBudgetWh}
                stroke="#ef476f"
                strokeDasharray="5 5"
                label="Budget"
              />
              <Line
                type="monotone"
                dataKey="lap_energy_wh"
                stroke="#14213d"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Lap energy"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel title="Carry-over" subtitle="Budget carry-over trend from lap to lap">
            <TelemetryChart data={deferredReadings}>
              <ReferenceLine y={0} stroke="rgba(20, 33, 61, 0.35)" />
              <Line
                type="monotone"
                dataKey="carry_over_wh"
                stroke="#06d6a0"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Carry-over"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Battery SoC"
            subtitle="State of charge over the current buffered history window"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="battery_soc_pct"
                stroke="#118ab2"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="SoC"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Powertrain Temperatures"
            subtitle="Motor, inverter, and gate driver thermal trend"
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
                dataKey="gate_driver_temp_c"
                stroke="#7353ba"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Gate driver"
              />
            </TelemetryChart>
          </ChartPanel>

          <ChartPanel
            title="Highest Cell Temperature"
            subtitle="Hottest battery cell temperature over time"
          >
            <TelemetryChart data={deferredReadings}>
              <Line
                type="monotone"
                dataKey="highest_cell_temp_c"
                stroke="#d62839"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Highest cell"
              />
            </TelemetryChart>
          </ChartPanel>
        </section>
      </main>
    </div>
  );
}
