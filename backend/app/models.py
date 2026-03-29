from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TelemetryReading(Base):
    __tablename__ = "telemetry_readings"
    __table_args__ = (
        Index("ix_telemetry_readings_simulator_ts", "simulator_ts"),
        Index("ix_telemetry_readings_vehicle_id_simulator_ts", "vehicle_id", "simulator_ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simulator_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    vehicle_id: Mapped[str] = mapped_column(String(64), nullable=False)
    lap_number: Mapped[int] = mapped_column(Integer, nullable=False)
    lap_distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    speed_kph: Mapped[float] = mapped_column(Float, nullable=False)
    acceleration_x_g: Mapped[float] = mapped_column(Float, nullable=False)
    acceleration_y_g: Mapped[float] = mapped_column(Float, nullable=False)
    acceleration_z_g: Mapped[float] = mapped_column(Float, nullable=False)
    battery_soc_pct: Mapped[float] = mapped_column(Float, nullable=False)
    battery_voltage_v: Mapped[float] = mapped_column(Float, nullable=False)
    battery_current_a: Mapped[float] = mapped_column(Float, nullable=False)
    battery_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    motor_rpm: Mapped[int] = mapped_column(Integer, nullable=False)
    motor_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    inverter_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    coolant_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    ambient_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    tire_fl_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    tire_fr_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    tire_rl_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    tire_rr_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    brake_pressure_front_bar: Mapped[float] = mapped_column(Float, nullable=False)
    brake_pressure_rear_bar: Mapped[float] = mapped_column(Float, nullable=False)
    steering_angle_deg: Mapped[float] = mapped_column(Float, nullable=False)
    throttle_pct: Mapped[float] = mapped_column(Float, nullable=False)
    brake_pct: Mapped[float] = mapped_column(Float, nullable=False)
    latitude_deg: Mapped[float] = mapped_column(Float, nullable=False)
    longitude_deg: Mapped[float] = mapped_column(Float, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    alert_events: Mapped[list["AlertEvent"]] = relationship(
        back_populates="reading",
        cascade="all, delete-orphan",
    )


class AlertEvent(Base):
    __tablename__ = "alert_events"
    __table_args__ = (
        Index("ix_alert_events_occurred_at", "occurred_at"),
        Index("ix_alert_events_alert_type_occurred_at", "alert_type", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reading_id: Mapped[int] = mapped_column(
        ForeignKey("telemetry_readings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alert_type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    threshold_value: Mapped[float] = mapped_column(Float, nullable=False)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    reading: Mapped[TelemetryReading] = relationship(back_populates="alert_events")
