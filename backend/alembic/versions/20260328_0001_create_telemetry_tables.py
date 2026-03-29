"""create telemetry tables

Revision ID: 20260328_0001
Revises:
Create Date: 2026-03-28 21:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260328_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry_readings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("simulator_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("vehicle_id", sa.String(length=64), nullable=False),
        sa.Column("lap_number", sa.Integer(), nullable=False),
        sa.Column("lap_distance_m", sa.Float(), nullable=False),
        sa.Column("speed_kph", sa.Float(), nullable=False),
        sa.Column("acceleration_x_g", sa.Float(), nullable=False),
        sa.Column("acceleration_y_g", sa.Float(), nullable=False),
        sa.Column("acceleration_z_g", sa.Float(), nullable=False),
        sa.Column("battery_soc_pct", sa.Float(), nullable=False),
        sa.Column("battery_voltage_v", sa.Float(), nullable=False),
        sa.Column("battery_current_a", sa.Float(), nullable=False),
        sa.Column("battery_temp_c", sa.Float(), nullable=False),
        sa.Column("motor_rpm", sa.Integer(), nullable=False),
        sa.Column("motor_temp_c", sa.Float(), nullable=False),
        sa.Column("inverter_temp_c", sa.Float(), nullable=False),
        sa.Column("coolant_temp_c", sa.Float(), nullable=False),
        sa.Column("ambient_temp_c", sa.Float(), nullable=False),
        sa.Column("tire_fl_temp_c", sa.Float(), nullable=False),
        sa.Column("tire_fr_temp_c", sa.Float(), nullable=False),
        sa.Column("tire_rl_temp_c", sa.Float(), nullable=False),
        sa.Column("tire_rr_temp_c", sa.Float(), nullable=False),
        sa.Column("brake_pressure_front_bar", sa.Float(), nullable=False),
        sa.Column("brake_pressure_rear_bar", sa.Float(), nullable=False),
        sa.Column("steering_angle_deg", sa.Float(), nullable=False),
        sa.Column("throttle_pct", sa.Float(), nullable=False),
        sa.Column("brake_pct", sa.Float(), nullable=False),
        sa.Column("latitude_deg", sa.Float(), nullable=False),
        sa.Column("longitude_deg", sa.Float(), nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_telemetry_readings_ingested_at",
        "telemetry_readings",
        ["ingested_at"],
        unique=False,
    )
    op.execute(
        """
        CREATE INDEX ix_telemetry_readings_simulator_ts_desc
        ON telemetry_readings (simulator_ts DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_telemetry_readings_vehicle_id_simulator_ts_desc
        ON telemetry_readings (vehicle_id, simulator_ts DESC)
        """
    )

    op.create_table(
        "alert_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reading_id", sa.Integer(), nullable=False),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("metric_name", sa.String(length=64), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("message", sa.String(length=255), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["reading_id"], ["telemetry_readings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_events_reading_id", "alert_events", ["reading_id"], unique=False)
    op.execute(
        """
        CREATE INDEX ix_alert_events_occurred_at_desc
        ON alert_events (occurred_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_alert_events_alert_type_occurred_at_desc
        ON alert_events (alert_type, occurred_at DESC)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_alert_events_alert_type_occurred_at_desc", table_name="alert_events")
    op.drop_index("ix_alert_events_occurred_at_desc", table_name="alert_events")
    op.drop_index("ix_alert_events_reading_id", table_name="alert_events")
    op.drop_table("alert_events")

    op.drop_index(
        "ix_telemetry_readings_vehicle_id_simulator_ts_desc",
        table_name="telemetry_readings",
    )
    op.drop_index("ix_telemetry_readings_simulator_ts_desc", table_name="telemetry_readings")
    op.drop_index("ix_telemetry_readings_ingested_at", table_name="telemetry_readings")
    op.drop_table("telemetry_readings")
