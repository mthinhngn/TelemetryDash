from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, field_validator


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseModel):
    database_url: str = "postgresql+asyncpg://telemetry:telemetry@localhost:5432/telemetry"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    retention_hours: int = 72
    cleanup_interval_seconds: int = 60

    low_battery_soc_pct: float = 20.0
    high_motor_temp_c: float = 110.0
    high_battery_temp_c: float = 70.0
    high_inverter_temp_c: float = 95.0
    high_coolant_temp_c: float = 105.0

    sim_enabled: bool = True
    sim_hz: float = 10.0
    sim_vehicle_id: str = "auto-sim"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if not value:
            return []
        return [origin.strip() for origin in value.split(",") if origin.strip()]


def _read_dotenv() -> dict[str, str]:
    dotenv_path = BASE_DIR / ".env"
    if not dotenv_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    dotenv_values = _read_dotenv()
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL",
            dotenv_values.get(
                "DATABASE_URL",
                "postgresql+asyncpg://telemetry:telemetry@localhost:5432/telemetry",
            ),
        ),
        cors_origins=os.getenv(
            "CORS_ORIGINS",
            dotenv_values.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"),
        ),
        retention_hours=os.getenv("RETENTION_HOURS", dotenv_values.get("RETENTION_HOURS", 72)),
        cleanup_interval_seconds=os.getenv(
            "CLEANUP_INTERVAL_SECONDS",
            dotenv_values.get("CLEANUP_INTERVAL_SECONDS", 60),
        ),
        low_battery_soc_pct=os.getenv(
            "LOW_BATTERY_SOC_PCT",
            dotenv_values.get("LOW_BATTERY_SOC_PCT", 20.0),
        ),
        high_motor_temp_c=os.getenv(
            "HIGH_MOTOR_TEMP_C",
            dotenv_values.get("HIGH_MOTOR_TEMP_C", 110.0),
        ),
        high_battery_temp_c=os.getenv(
            "HIGH_BATTERY_TEMP_C",
            dotenv_values.get("HIGH_BATTERY_TEMP_C", 70.0),
        ),
        high_inverter_temp_c=os.getenv(
            "HIGH_INVERTER_TEMP_C",
            dotenv_values.get("HIGH_INVERTER_TEMP_C", 95.0),
        ),
        high_coolant_temp_c=os.getenv(
            "HIGH_COOLANT_TEMP_C",
            dotenv_values.get("HIGH_COOLANT_TEMP_C", 105.0),
        ),
        sim_enabled=os.getenv("SIM_ENABLED", dotenv_values.get("SIM_ENABLED", True)),
        sim_hz=float(os.getenv("SIM_HZ", dotenv_values.get("SIM_HZ", 10.0))),
        sim_vehicle_id=os.getenv("SIM_VEHICLE_ID", dotenv_values.get("SIM_VEHICLE_ID", "auto-sim")),
    )
