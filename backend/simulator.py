"""
Race car telemetry simulator.
Posts fake telemetry to the backend at 10 Hz.

Usage:
    python simulator.py
    python simulator.py --url http://localhost:8000 --hz 10 --vehicle sim-1
"""

import argparse
import math
import random
import time
from datetime import UTC, datetime

import httpx

LAP_LENGTH_M = 4_500


def build_packet(t: float, soc: float, lap: int, vehicle_id: str) -> dict:
    """Generate one realistic telemetry packet at simulation time t (seconds)."""

    # Speed: sinusoidal lap profile between 40 and 180 kph
    speed_kph = 110 + 70 * math.sin(2 * math.pi * t / 60) + random.uniform(-5, 5)
    speed_kph = max(0.0, speed_kph)

    motor_rpm = int(speed_kph * 80 + random.uniform(-200, 200))
    throttle = max(0.0, min(100.0, 50 + 40 * math.sin(2 * math.pi * t / 60) + random.uniform(-5, 5)))
    brake = max(0.0, min(100.0, 20 - 18 * math.sin(2 * math.pi * t / 60) + random.uniform(0, 5)))

    motor_temp = 65 + 20 * (1 - soc / 100) + random.uniform(-2, 2)
    inverter_temp = motor_temp * 0.9 + random.uniform(-1, 1)
    coolant_temp = 55 + 10 * (1 - soc / 100) + random.uniform(-1, 1)
    battery_temp = 38 + 8 * (1 - soc / 100) + random.uniform(-1, 1)

    lap_distance_m = (speed_kph / 3.6 * t) % LAP_LENGTH_M

    return {
        "simulator_ts": datetime.now(UTC).isoformat(),
        "vehicle_id": vehicle_id,
        "lap_number": lap,
        "lap_distance_m": round(lap_distance_m, 1),
        "speed_kph": round(speed_kph, 2),
        "acceleration_x_g": round(random.uniform(-1.5, 1.5), 3),
        "acceleration_y_g": round(random.uniform(-2.0, 2.0), 3),
        "acceleration_z_g": round(random.uniform(0.8, 1.2), 3),
        "battery_soc_pct": round(soc, 2),
        "battery_voltage_v": round(320 + soc * 0.8, 1),
        "battery_current_a": round(throttle * 2.5 + random.uniform(-5, 5), 1),
        "battery_temp_c": round(battery_temp, 1),
        "motor_rpm": max(0, motor_rpm),
        "motor_temp_c": round(motor_temp, 1),
        "inverter_temp_c": round(inverter_temp, 1),
        "coolant_temp_c": round(coolant_temp, 1),
        "ambient_temp_c": round(21.5 + random.uniform(-0.5, 0.5), 1),
        "tire_fl_temp_c": round(85 + random.uniform(-5, 5), 1),
        "tire_fr_temp_c": round(85 + random.uniform(-5, 5), 1),
        "tire_rl_temp_c": round(90 + random.uniform(-5, 5), 1),
        "tire_rr_temp_c": round(90 + random.uniform(-5, 5), 1),
        "brake_pressure_front_bar": round(max(0, brake * 0.25), 2),
        "brake_pressure_rear_bar": round(max(0, brake * 0.18), 2),
        "steering_angle_deg": round(random.uniform(-15, 15), 1),
        "throttle_pct": round(throttle, 1),
        "brake_pct": round(brake, 1),
        "latitude_deg": round(51.5074 + random.uniform(-0.001, 0.001), 6),
        "longitude_deg": round(-0.1278 + random.uniform(-0.001, 0.001), 6),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--hz", type=float, default=10.0)
    parser.add_argument("--vehicle", default="sim-1")
    args = parser.parse_args()

    interval = 1.0 / args.hz
    endpoint = f"{args.url}/telemetry"

    print(f"Simulator starting — posting to {endpoint} at {args.hz} Hz")
    print("Press Ctrl+C to stop.\n")

    soc = 95.0
    lap = 1
    t = 0.0
    sent = 0

    with httpx.Client(timeout=5.0) as client:
        while True:
            start = time.monotonic()

            packet = build_packet(t, soc, lap, args.vehicle)
            try:
                resp = client.post(endpoint, json=packet)
                alerts = resp.json().get("alerts", [])
                alert_str = f"  ⚠ {len(alerts)} alert(s)" if alerts else ""
                print(f"[{sent:>5}] speed={packet['speed_kph']:6.1f} kph  soc={soc:5.1f}%  lap={lap}{alert_str}")
            except Exception as e:
                print(f"[{sent:>5}] POST failed: {e}")

            # Drain SoC slowly (~1% per 30 seconds at 10 Hz)
            soc = max(0.0, soc - 0.003)
            t += interval
            sent += 1

            # Advance lap when distance resets
            if (packet["lap_distance_m"] < 50) and t > 10:
                lap += 1

            elapsed = time.monotonic() - start
            sleep_time = interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)


if __name__ == "__main__":
    main()
