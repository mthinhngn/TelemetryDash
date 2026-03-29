import type { AlertEvent } from "../types/telemetry";

interface AlertFeedProps {
  alerts: AlertEvent[];
}

export function AlertFeed({ alerts }: AlertFeedProps) {
  return (
    <section className="panel alert-feed" aria-labelledby="alert-feed-title">
      <div className="panel__header">
        <h2 id="alert-feed-title">Alert Feed</h2>
        <span>{alerts.length} visible</span>
      </div>
      {alerts.length === 0 ? (
        <p className="alert-feed__empty">No active alerts have been received.</p>
      ) : (
        <ol className="alert-feed__list">
          {alerts.map((alert) => (
            <li
              className={`alert-feed__item alert-feed__item--${alert.severity}`}
              key={alert.id}
            >
              <div className="alert-feed__meta">
                <span className="alert-feed__level">{alert.severity}</span>
                <span>{new Date(alert.occurred_at).toLocaleTimeString()}</span>
              </div>
              <strong className="alert-feed__metric">{alert.metric_name}</strong>
              <p className="alert-feed__message">{alert.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
