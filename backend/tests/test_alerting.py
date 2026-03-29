from app.alerting import detect_alerts
from app.config import Settings
from app.schemas import TelemetryIn


def make_packet(**overrides) -> TelemetryIn:
    payload = {
        "simulator_ts": "2026-03-28T20:00:00Z",
        "vehicle_id": "sim-01",
        "lap_number": 4,
        "lap_distance_m": 1234.5,
        "speed_kph": 88.0,
        "acceleration_x_g": 0.1,
        "acceleration_y_g": 0.0,
        "acceleration_z_g": 1.0,
        "battery_soc_pct": 68.0,
        "battery_voltage_v": 402.5,
        "battery_current_a": 120.0,
        "battery_temp_c": 39.0,
        "motor_rpm": 5600,
        "motor_temp_c": 72.0,
        "inverter_temp_c": 50.0,
        "coolant_temp_c": 45.0,
        "ambient_temp_c": 23.0,
        "tire_fl_temp_c": 54.0,
        "tire_fr_temp_c": 53.0,
        "tire_rl_temp_c": 49.0,
        "tire_rr_temp_c": 48.0,
        "brake_pressure_front_bar": 12.0,
        "brake_pressure_rear_bar": 10.5,
        "steering_angle_deg": 3.2,
        "throttle_pct": 37.5,
        "brake_pct": 0.0,
        "latitude_deg": 37.7749,
        "longitude_deg": -122.4194,
    }
    payload.update(overrides)
    return TelemetryIn(**payload)


def test_detect_alerts_returns_empty_for_normal_packet() -> None:
    alerts = detect_alerts(make_packet(), Settings())
    assert alerts == []


def test_detect_alerts_returns_all_breaches() -> None:
    packet = make_packet(
        battery_soc_pct=12.0,
        battery_temp_c=73.0,
        motor_temp_c=111.0,
        inverter_temp_c=99.0,
        coolant_temp_c=106.0,
    )

    alerts = detect_alerts(packet, Settings())
    alert_types = {alert.alert_type for alert in alerts}

    assert alert_types == {
        "low_battery_soc",
        "battery_overtemp",
        "motor_overtemp",
        "inverter_overtemp",
        "coolant_overtemp",
    }
