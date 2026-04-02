from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .background import run_simulator
from .config import get_settings
from .database import init_db
from .routers import health, telemetry, ws


settings = get_settings()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("telemetry.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()

    sim_task: asyncio.Task | None = None
    if settings.sim_enabled:
        logger.info(
            "starting background simulator hz=%.1f vehicle=%s",
            settings.sim_hz,
            settings.sim_vehicle_id,
        )
        sim_task = asyncio.create_task(
            run_simulator(hz=settings.sim_hz, vehicle_id=settings.sim_vehicle_id, settings=settings),
            name="background-simulator",
        )

    try:
        yield
    finally:
        if sim_task is not None:
            sim_task.cancel()
            try:
                await asyncio.wait_for(sim_task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass


app = FastAPI(
    title="Telemetry Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(telemetry.router)
app.include_router(ws.router)
