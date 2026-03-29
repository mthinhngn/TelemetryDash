from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket


logger = logging.getLogger("telemetry.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        logger.info("websocket connected; active_connections=%s", len(self._connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)
            active_connections = len(self._connections)
        logger.info("websocket disconnected; active_connections=%s", active_connections)

    async def broadcast(self, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections)

        logger.debug(
            "broadcasting websocket payload type=%s recipients=%s",
            payload.get("type"),
            len(connections),
        )
        stale: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                logger.exception("failed to send websocket payload; dropping stale connection")
                stale.append(websocket)

        for websocket in stale:
            await self.disconnect(websocket)


manager = ConnectionManager()
