from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.main as main_module
import app.routers.ws as ws_router
from app.database import get_session
from .test_service import make_packet


def _override_session(session_factory: async_sessionmaker[AsyncSession]):
    async def _get_session():
        async with session_factory() as session:
            yield session

    return _get_session


def test_websocket_receives_snapshot_and_live_telemetry(
    monkeypatch,
    session: AsyncSession,
) -> None:
    session_factory = async_sessionmaker(session.bind, expire_on_commit=False)

    async def fake_init_db() -> None:
        return None

    monkeypatch.setattr(main_module, "init_db", fake_init_db)
    monkeypatch.setattr(ws_router, "AsyncSessionLocal", session_factory)
    main_module.app.dependency_overrides[get_session] = _override_session(session_factory)

    try:
        with TestClient(main_module.app) as client:
            with client.websocket_connect("/ws") as websocket:
                snapshot = websocket.receive_json()
                assert snapshot["type"] == "snapshot"

                packet = make_packet(
                    simulator_ts=datetime.now(UTC).isoformat(),
                    lap_distance_m=1900.0,
                )
                response = client.post("/telemetry", json=packet.model_dump(mode="json"))

                assert response.status_code == 201

                live_message = websocket.receive_json()
                while live_message["type"] == "keepalive":
                    live_message = websocket.receive_json()

                assert live_message["type"] == "telemetry"
                assert live_message["reading"]["lap_distance_m"] == 1900.0
    finally:
        main_module.app.dependency_overrides.clear()


def test_websocket_disconnect_cleanup_does_not_break_following_broadcast(
    monkeypatch,
    session: AsyncSession,
) -> None:
    session_factory = async_sessionmaker(session.bind, expire_on_commit=False)

    async def fake_init_db() -> None:
        return None

    monkeypatch.setattr(main_module, "init_db", fake_init_db)
    monkeypatch.setattr(ws_router, "AsyncSessionLocal", session_factory)
    main_module.app.dependency_overrides[get_session] = _override_session(session_factory)

    try:
        with TestClient(main_module.app) as client:
            with client.websocket_connect("/ws") as websocket:
                websocket.receive_json()

            packet = make_packet(
                simulator_ts=datetime.now(UTC).isoformat(),
                lap_distance_m=2100.0,
            )
            response = client.post("/telemetry", json=packet.model_dump(mode="json"))
            assert response.status_code == 201
    finally:
        main_module.app.dependency_overrides.clear()
