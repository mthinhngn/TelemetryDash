from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .alerting import detect_alerts
from .config import Settings
from .models import AlertEvent, TelemetryReading
from .schemas import TelemetryIn


_cleanup_lock = asyncio.Lock()
_last_cleanup_at: datetime | None = None


async def maybe_prune_expired_data(session: AsyncSession, settings: Settings) -> None:
    global _last_cleanup_at

    now = datetime.now(UTC)
    if _last_cleanup_at and now - _last_cleanup_at < timedelta(seconds=settings.cleanup_interval_seconds):
        return

    async with _cleanup_lock:
        now = datetime.now(UTC)
        if _last_cleanup_at and now - _last_cleanup_at < timedelta(seconds=settings.cleanup_interval_seconds):
            return

        cutoff = now - timedelta(hours=settings.retention_hours)
        await session.execute(delete(AlertEvent).where(AlertEvent.occurred_at < cutoff))
        await session.execute(delete(TelemetryReading).where(TelemetryReading.ingested_at < cutoff))
        _last_cleanup_at = now


async def ingest_telemetry(
    session: AsyncSession,
    packet: TelemetryIn,
    settings: Settings,
) -> tuple[TelemetryReading, list[AlertEvent]]:
    reading = TelemetryReading(**packet.model_dump())
    session.add(reading)
    await session.flush()

    alert_rows: list[AlertEvent] = []
    for alert in detect_alerts(packet, settings):
        alert_row = AlertEvent(
            reading_id=reading.id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            metric_name=alert.metric_name,
            metric_value=alert.metric_value,
            threshold_value=alert.threshold_value,
            message=alert.message,
        )
        session.add(alert_row)
        alert_rows.append(alert_row)

    await session.commit()
    await session.refresh(reading)
    for alert_row in alert_rows:
        await session.refresh(alert_row)
    return reading, alert_rows


async def fetch_history(session: AsyncSession, minutes: int) -> list[TelemetryReading]:
    cutoff = datetime.now(UTC) - timedelta(minutes=minutes)
    result = await session.execute(
        select(TelemetryReading)
        .where(TelemetryReading.simulator_ts >= cutoff)
        .order_by(TelemetryReading.simulator_ts.asc())
    )
    return list(result.scalars().all())


async def fetch_recent_readings(session: AsyncSession, limit: int = 100) -> list[TelemetryReading]:
    result = await session.execute(
        select(TelemetryReading)
        .order_by(TelemetryReading.simulator_ts.desc())
        .limit(limit)
    )
    rows = list(result.scalars().all())
    rows.reverse()
    return rows
