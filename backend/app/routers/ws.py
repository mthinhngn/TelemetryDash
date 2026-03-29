from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import AsyncSessionLocal
from ..schemas import TelemetryReadingOut
from ..service import fetch_recent_readings
from ..ws import manager


router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def telemetry_stream(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        async with AsyncSessionLocal() as session:
            snapshot_rows = await fetch_recent_readings(session, limit=100)
            snapshot = [
                TelemetryReadingOut.model_validate(reading).model_dump(mode="json")
                for reading in snapshot_rows
            ]
        await websocket.send_json({"type": "snapshot", "readings": snapshot})

        while True:
            await websocket.receive()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
