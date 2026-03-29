from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TelemetryIn(BaseModel):
    simulator_ts: datetime
    vehicle_id: Annotated[str, Field(min_length=1, max_length=64)]
    lap_number: Annotated[int, Field(ge=0)]
    lap_distance_m: float
    speed_kph: float
    acceleration_x_g: float
    acceleration_y_g: float
    acceleration_z_g: float
    battery_soc_pct: Annotated[float, Field(ge=0, le=100)]
    battery_voltage_v: float
    battery_current_a: float
    battery_temp_c: float
    motor_rpm: Annotated[int, Field(ge=0)]
    motor_temp_c: float
    inverter_temp_c: float
    coolant_temp_c: float
    ambient_temp_c: float
    tire_fl_temp_c: float
    tire_fr_temp_c: float
    tire_rl_temp_c: float
    tire_rr_temp_c: float
    brake_pressure_front_bar: Annotated[float, Field(ge=0)]
    brake_pressure_rear_bar: Annotated[float, Field(ge=0)]
    steering_angle_deg: float
    throttle_pct: Annotated[float, Field(ge=0, le=100)]
    brake_pct: Annotated[float, Field(ge=0, le=100)]
    latitude_deg: Annotated[float, Field(ge=-90, le=90)]
    longitude_deg: Annotated[float, Field(ge=-180, le=180)]

    @field_validator("simulator_ts", mode="before")
    @classmethod
    def normalize_simulator_ts(cls, value: datetime | str) -> datetime:
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def ensure_numbers_are_finite(self) -> "TelemetryIn":
        for name, field_info in self.model_fields.items():
            value = getattr(self, name)
            if field_info.annotation in (float, int) and isinstance(value, (float, int)) and not math.isfinite(value):
                raise ValueError(f"{name} must be a finite number")
        return self


class TelemetryReadingOut(TelemetryIn, ORMModel):
    id: int
    ingested_at: datetime


class AlertEventOut(ORMModel):
    id: int
    reading_id: int
    alert_type: str
    severity: str
    metric_name: str
    metric_value: float
    threshold_value: float
    message: str
    occurred_at: datetime


class TelemetryIngestResponse(BaseModel):
    reading: TelemetryReadingOut
    alerts: list[AlertEventOut]


class TelemetryHistoryResponse(BaseModel):
    minutes: int
    count: int
    readings: list[TelemetryReadingOut]


class HealthResponse(BaseModel):
    status: str
