from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.service as service_module
from app.config import Settings
from app.database import Base
from app.models import AlertEvent, TelemetryReading
from app.schemas import TelemetryIn
from app.service import fetch_alert_history, fetch_history, ingest_telemetry, maybe_prune_expired_data


def make_packet(**overrides) -> TelemetryIn:
    payload = {
        "simulator_ts": "2026-03-28T20:00:00Z",
        "vehicle_id": "sim-01",
        "lap_number": 4,
        "lap_distance_m": 1234.5,
        "speed_kph": 88.0,
        "acceleration_x_g": 0.1,
        "acceleration_y_g": 0.0,
        "acceleration_z_g": 1.0,
        "battery_soc_pct": 68.0,
        "battery_voltage_v": 402.5,
        "battery_current_a": 120.0,
        "battery_temp_c": 39.0,
        "motor_rpm": 5600,
        "motor_temp_c": 72.0,
        "inverter_temp_c": 50.0,
        "coolant_temp_c": 45.0,
        "ambient_temp_c": 23.0,
        "tire_fl_temp_c": 54.0,
        "tire_fr_temp_c": 53.0,
        "tire_rl_temp_c": 49.0,
        "tire_rr_temp_c": 48.0,
        "brake_pressure_front_bar": 12.0,
        "brake_pressure_rear_bar": 10.5,
        "steering_angle_deg": 3.2,
        "throttle_pct": 37.5,
        "brake_pct": 0.0,
        "latitude_deg": 37.7749,
        "longitude_deg": -122.4194,
    }
    payload.update(overrides)
    return TelemetryIn(**payload)


@pytest_asyncio.fixture
async def session() -> AsyncSession:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as db_session:
        yield db_session

    await engine.dispose()


@pytest.mark.asyncio
async def test_ingest_telemetry_persists_reading_and_alerts(session: AsyncSession) -> None:
    packet = make_packet(
        battery_soc_pct=10.0,
        motor_temp_c=115.0,
    )

    reading, alerts = await ingest_telemetry(session, packet, Settings())

    readings = list((await session.execute(select(TelemetryReading))).scalars())
    persisted_alerts = list((await session.execute(select(AlertEvent))).scalars())

    assert reading.id is not None
    assert len(readings) == 1
    assert {alert.alert_type for alert in alerts} == {"low_battery_soc", "motor_overtemp"}
    assert len(persisted_alerts) == 2


@pytest.mark.asyncio
async def test_fetch_history_returns_latest_rows_sorted_ascending_and_limited(
    session: AsyncSession,
) -> None:
    base_time = datetime.now(UTC).replace(microsecond=0)

    for offset_minutes in (4, 3, 2, 1):
        packet = make_packet(
            simulator_ts=base_time - timedelta(minutes=offset_minutes),
            lap_distance_m=1000 + offset_minutes,
        )
        await ingest_telemetry(session, packet, Settings())

    history = await fetch_history(session, minutes=5, limit=2)

    assert len(history) == 2
    assert history[0].simulator_ts < history[1].simulator_ts
    assert [reading.lap_distance_m for reading in history] == [1002, 1001]


@pytest.mark.asyncio
async def test_fetch_alert_history_returns_recent_alerts_first(session: AsyncSession) -> None:
    base_time = datetime.now(UTC).replace(microsecond=0)

    for index, motor_temp in enumerate((111.0, 112.0, 113.0), start=1):
        packet = make_packet(
            simulator_ts=base_time - timedelta(seconds=index),
            motor_temp_c=motor_temp,
            lap_distance_m=2000 + index,
        )
        await ingest_telemetry(session, packet, Settings())

    alerts = await fetch_alert_history(session, minutes=5, limit=2)

    assert len(alerts) == 2
    assert alerts[0].occurred_at >= alerts[1].occurred_at


@pytest.mark.asyncio
async def test_maybe_prune_expired_data_deletes_stale_rows(session: AsyncSession) -> None:
    service_module._last_cleanup_at = None

    now = datetime.now(UTC).replace(microsecond=0)
    stale_packet = make_packet(simulator_ts=now - timedelta(hours=80), lap_distance_m=10.0)
    fresh_packet = make_packet(simulator_ts=now - timedelta(hours=1), lap_distance_m=20.0)

    stale_reading = TelemetryReading(
        **stale_packet.model_dump(),
        ingested_at=now - timedelta(hours=80),
    )
    fresh_reading = TelemetryReading(
        **fresh_packet.model_dump(),
        ingested_at=now - timedelta(hours=1),
    )
    session.add_all([stale_reading, fresh_reading])
    await session.flush()

    session.add_all(
        [
            AlertEvent(
                reading_id=stale_reading.id,
                alert_type="motor_overtemp",
                severity="critical",
                metric_name="motor_temp_c",
                metric_value=111.0,
                threshold_value=110.0,
                message="stale alert",
                occurred_at=now - timedelta(hours=80),
            ),
            AlertEvent(
                reading_id=fresh_reading.id,
                alert_type="motor_overtemp",
                severity="critical",
                metric_name="motor_temp_c",
                metric_value=111.0,
                threshold_value=110.0,
                message="fresh alert",
                occurred_at=now - timedelta(hours=1),
            ),
        ]
    )
    await session.commit()

    await maybe_prune_expired_data(session, Settings(retention_hours=72, cleanup_interval_seconds=0))
    await session.commit()

    readings = list((await session.execute(select(TelemetryReading))).scalars())
    alerts = list((await session.execute(select(AlertEvent))).scalars())

    assert len(readings) == 1
    assert readings[0].lap_distance_m == 20.0
    assert len(alerts) == 1
    assert alerts[0].message == "fresh alert"
