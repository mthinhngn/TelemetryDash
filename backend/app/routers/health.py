from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..schemas import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def healthcheck(session: AsyncSession = Depends(get_session)) -> HealthResponse:
    await session.execute(text("SELECT 1"))
    return HealthResponse(status="ok")
