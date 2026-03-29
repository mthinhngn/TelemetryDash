interface FanIndicatorProps {
  label: string;
  active: boolean;
}

export function FanIndicator({ label, active }: FanIndicatorProps) {
  return (
    <article className={`fan-indicator fan-indicator--${active ? "active" : "inactive"}`}>
      <span className="fan-indicator__label">{label}</span>
      <strong className="fan-indicator__state">{active ? "ON" : "OFF"}</strong>
    </article>
  );
}
