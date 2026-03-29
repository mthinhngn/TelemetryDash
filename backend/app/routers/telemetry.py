from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..schemas import (
    AlertEventOut,
    TelemetryHistoryResponse,
    TelemetryIn,
    TelemetryIngestResponse,
    TelemetryReadingOut,
)
from ..service import fetch_history, ingest_telemetry, maybe_prune_expired_data
from ..ws import manager


router = APIRouter(tags=["telemetry"])


@router.post("/telemetry", response_model=TelemetryIngestResponse, status_code=status.HTTP_201_CREATED)
async def receive_telemetry(
    packet: TelemetryIn,
    session: AsyncSession = Depends(get_session),
) -> TelemetryIngestResponse:
    settings = get_settings()
    await maybe_prune_expired_data(session, settings)
    reading, alerts = await ingest_telemetry(session, packet, settings)

    reading_out = TelemetryReadingOut.model_validate(reading)
    alerts_out = [AlertEventOut.model_validate(alert) for alert in alerts]

    await manager.broadcast({"type": "telemetry", "reading": reading_out.model_dump(mode="json")})
    for alert in alerts_out:
        await manager.broadcast({"type": "alert", "alert": alert.model_dump(mode="json")})

    return TelemetryIngestResponse(reading=reading_out, alerts=alerts_out)


@router.get("/telemetry/history", response_model=TelemetryHistoryResponse)
async def get_telemetry_history(
    minutes: int = Query(default=15, ge=1, le=24 * 60),
    session: AsyncSession = Depends(get_session),
) -> TelemetryHistoryResponse:
    readings = await fetch_history(session, minutes=minutes)
    serialized = [TelemetryReadingOut.model_validate(reading) for reading in readings]
    return TelemetryHistoryResponse(minutes=minutes, count=len(serialized), readings=serialized)
