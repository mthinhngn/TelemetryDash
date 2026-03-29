from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import AsyncSessionLocal
from ..schemas import TelemetryReadingOut
from ..service import fetch_recent_readings
from ..ws import manager


router = APIRouter(tags=["websocket"])
logger = logging.getLogger("telemetry.ws")
KEEPALIVE_INTERVAL_SECONDS = 15


@router.websocket("/ws")
async def telemetry_stream(websocket: WebSocket) -> None:
    logger.info("websocket handshake starting")
    await manager.connect(websocket)
    try:
        async with AsyncSessionLocal() as session:
            snapshot_rows = await fetch_recent_readings(session, limit=100)
            snapshot = [
                TelemetryReadingOut.model_validate(reading).model_dump(mode="json")
                for reading in snapshot_rows
            ]
        logger.info("sending websocket snapshot with %s readings", len(snapshot))
        await websocket.send_json({"type": "snapshot", "readings": snapshot})

        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL_SECONDS)
            await websocket.send_json(
                {"type": "keepalive", "ts": datetime.now(UTC).isoformat()}
            )
            logger.debug("sent websocket keepalive")
    except WebSocketDisconnect:
        logger.info("websocket disconnected by client")
    except Exception:
        logger.exception("websocket stream failed")
    finally:
        await manager.disconnect(websocket)
