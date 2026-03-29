from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .config import Settings
from .schemas import TelemetryIn


Comparator = Literal["gte", "lte"]


@dataclass(frozen=True)
class AlertRule:
    alert_type: str
    severity: str
    metric_name: str
    comparator: Comparator
    threshold_value: float
    message_template: str

    def is_triggered(self, metric_value: float) -> bool:
        if self.comparator == "gte":
            return metric_value >= self.threshold_value
        return metric_value <= self.threshold_value

    def render_message(self, metric_value: float) -> str:
        operator_text = ">=" if self.comparator == "gte" else "<="
        return self.message_template.format(
            metric_value=f"{metric_value:.2f}",
            threshold_value=f"{self.threshold_value:.2f}",
            operator=operator_text,
        )


@dataclass(frozen=True)
class DetectedAlert:
    alert_type: str
    severity: str
    metric_name: str
    metric_value: float
    threshold_value: float
    message: str


def build_rules(settings: Settings) -> list[AlertRule]:
    return [
        AlertRule(
            alert_type="low_battery_soc",
            severity="warning",
            metric_name="battery_soc_pct",
            comparator="lte",
            threshold_value=settings.low_battery_soc_pct,
            message_template="Battery SOC is {metric_value}% (threshold {operator} {threshold_value}%).",
        ),
        AlertRule(
            alert_type="motor_overtemp",
            severity="critical",
            metric_name="motor_temp_c",
            comparator="gte",
            threshold_value=settings.high_motor_temp_c,
            message_template="Motor temperature is {metric_value}C (threshold {operator} {threshold_value}C).",
        ),
        AlertRule(
            alert_type="battery_overtemp",
            severity="critical",
            metric_name="battery_temp_c",
            comparator="gte",
            threshold_value=settings.high_battery_temp_c,
            message_template="Battery temperature is {metric_value}C (threshold {operator} {threshold_value}C).",
        ),
        AlertRule(
            alert_type="inverter_overtemp",
            severity="warning",
            metric_name="inverter_temp_c",
            comparator="gte",
            threshold_value=settings.high_inverter_temp_c,
            message_template="Inverter temperature is {metric_value}C (threshold {operator} {threshold_value}C).",
        ),
        AlertRule(
            alert_type="coolant_overtemp",
            severity="warning",
            metric_name="coolant_temp_c",
            comparator="gte",
            threshold_value=settings.high_coolant_temp_c,
            message_template="Coolant temperature is {metric_value}C (threshold {operator} {threshold_value}C).",
        ),
    ]


def detect_alerts(packet: TelemetryIn, settings: Settings) -> list[DetectedAlert]:
    alerts: list[DetectedAlert] = []
    for rule in build_rules(settings):
        metric_value = float(getattr(packet, rule.metric_name))
        if not rule.is_triggered(metric_value):
            continue
        alerts.append(
            DetectedAlert(
                alert_type=rule.alert_type,
                severity=rule.severity,
                metric_name=rule.metric_name,
                metric_value=metric_value,
                threshold_value=rule.threshold_value,
                message=rule.render_message(metric_value),
            )
        )
    return alerts
