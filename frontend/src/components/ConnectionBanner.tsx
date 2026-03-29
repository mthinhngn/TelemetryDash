import type { ConnectionStatus } from "../lib/telemetryClient";

interface ConnectionBannerProps {
  errorMessage: string | null;
  status: ConnectionStatus;
}

const statusCopy: Record<Exclude<ConnectionStatus, "idle" | "connected">, string> = {
  connecting: "Connecting to telemetry stream...",
  reconnecting: "Reconnecting to telemetry stream...",
  disconnected: "Telemetry stream offline.",
};

export function ConnectionBanner({ errorMessage, status }: ConnectionBannerProps) {
  if (status === "idle" || status === "connected") {
    return null;
  }

  return (
    <div className={`connection-banner connection-banner--${status}`} role="status">
      <span>{statusCopy[status]}</span>
      {errorMessage ? <span className="connection-banner__detail">{errorMessage}</span> : null}
    </div>
  );
}
