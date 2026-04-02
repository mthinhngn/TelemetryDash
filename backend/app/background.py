from __future__ import annotations

import asyncio
import logging
import math
import random
from datetime import UTC, datetime

from .config import Settings
from .database import AsyncSessionLocal
from .schemas import AlertEventOut, TelemetryIn, TelemetryReadingOut
from .service import ingest_telemetry
from .ws import manager

logger = logging.getLogger("telemetry.simulator")
LAP_LENGTH_M = 4_500


def build_sim_packet(t: float, soc: float, lap: int, vehicle_id: str) -> TelemetryIn:
    speed_kph = max(0.0, 110 + 70 * math.sin(2 * math.pi * t / 60) + random.uniform(-5, 5))
    motor_rpm = max(0, int(speed_kph * 80 + random.uniform(-200, 200)))
    throttle = max(0.0, min(100.0, 50 + 40 * math.sin(2 * math.pi * t / 60) + random.uniform(-5, 5)))
    brake = max(0.0, min(100.0, 20 - 18 * math.sin(2 * math.pi * t / 60) + random.uniform(0, 5)))
    motor_temp = 65 + 20 * (1 - soc / 100) + random.uniform(-2, 2)
    inverter_temp = motor_temp * 0.9 + random.uniform(-1, 1)
    coolant_temp = 55 + 10 * (1 - soc / 100) + random.uniform(-1, 1)
    battery_temp = 38 + 8 * (1 - soc / 100) + random.uniform(-1, 1)
    lap_distance_m = (speed_kph / 3.6 * t) % LAP_LENGTH_M

    return TelemetryIn(
        simulator_ts=datetime.now(UTC),
        vehicle_id=vehicle_id,
        lap_number=lap,
        lap_distance_m=round(lap_distance_m, 1),
        speed_kph=round(speed_kph, 2),
        acceleration_x_g=round(random.uniform(-1.5, 1.5), 3),
        acceleration_y_g=round(random.uniform(-2.0, 2.0), 3),
        acceleration_z_g=round(random.uniform(0.8, 1.2), 3),
        battery_soc_pct=round(soc, 2),
        battery_voltage_v=round(320 + soc * 0.8, 1),
        battery_current_a=round(throttle * 2.5 + random.uniform(-5, 5), 1),
        battery_temp_c=round(battery_temp, 1),
        motor_rpm=motor_rpm,
        motor_temp_c=round(motor_temp, 1),
        inverter_temp_c=round(inverter_temp, 1),
        coolant_temp_c=round(coolant_temp, 1),
        ambient_temp_c=round(21.5 + random.uniform(-0.5, 0.5), 1),
        tire_fl_temp_c=round(85 + random.uniform(-5, 5), 1),
        tire_fr_temp_c=round(85 + random.uniform(-5, 5), 1),
        tire_rl_temp_c=round(90 + random.uniform(-5, 5), 1),
        tire_rr_temp_c=round(90 + random.uniform(-5, 5), 1),
        brake_pressure_front_bar=round(max(0.0, brake * 0.25), 2),
        brake_pressure_rear_bar=round(max(0.0, brake * 0.18), 2),
        steering_angle_deg=round(random.uniform(-15, 15), 1),
        throttle_pct=round(throttle, 1),
        brake_pct=round(brake, 1),
        latitude_deg=round(51.5074 + random.uniform(-0.001, 0.001), 6),
        longitude_deg=round(-0.1278 + random.uniform(-0.001, 0.001), 6),
    )


async def run_simulator(hz: float, vehicle_id: str, settings: Settings) -> None:
    interval = 1.0 / hz
    t, soc, lap = 0.0, 95.0, 1
    packet = None
    logger.info("background simulator running at %.1f Hz, vehicle=%s", hz, vehicle_id)

    while True:
        deadline = asyncio.get_event_loop().time() + interval
        try:
            packet = build_sim_packet(t, soc, lap, vehicle_id)
            async with AsyncSessionLocal() as session:
                reading, alerts = await ingest_telemetry(session, packet, settings)

            reading_out = TelemetryReadingOut.model_validate(reading)
            await manager.broadcast({"type": "telemetry", "reading": reading_out.model_dump(mode="json")})
            for alert in alerts:
                alert_out = AlertEventOut.model_validate(alert)
                await manager.broadcast({"type": "alert", "alert": alert_out.model_dump(mode="json")})

        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("simulator tick failed; continuing")

        soc = max(0.0, soc - 0.003)
        t += interval
        if t > 10 and packet is not None and packet.lap_distance_m < 50:
            lap += 1

        sleep_for = deadline - asyncio.get_event_loop().time()
        if sleep_for > 0:
            await asyncio.sleep(sleep_for)
