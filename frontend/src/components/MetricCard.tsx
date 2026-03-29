import type { AlertLevel } from "../types/telemetry";

type MetricSeverity = AlertLevel | "normal";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  severity?: MetricSeverity;
}

export function MetricCard({
  label,
  value,
  unit,
  detail,
  severity = "normal",
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${severity}`}>
      <header className="metric-card__header">
        <span className="metric-card__label">{label}</span>
        <span className={`metric-card__severity metric-card__severity--${severity}`}>
          {severity}
        </span>
      </header>
      <div className="metric-card__value-row">
        <strong className="metric-card__value">{value}</strong>
        {unit ? <span className="metric-card__unit">{unit}</span> : null}
      </div>
      {detail ? <p className="metric-card__detail">{detail}</p> : null}
    </article>
  );
}
