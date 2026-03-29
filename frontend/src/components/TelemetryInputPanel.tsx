import { type FormEvent, useMemo, useState } from "react";
import { appConfig } from "../config";
import {
  buildTelemetrySubmitPayload,
  createDefaultTelemetryFormValues,
  generateRandomTelemetryFormValues,
} from "../lib/telemetryInput";
import type { TelemetryInputFormValues } from "../types/telemetry";

type SubmissionState = "idle" | "success" | "error";

type FieldName = keyof TelemetryInputFormValues;

interface FieldDefinition {
  label: string;
  name: FieldName;
  step?: string;
  type: "number" | "text";
}

interface SectionDefinition {
  description: string;
  key: string;
  title: string;
  fields: FieldDefinition[];
}

interface TelemetryInputPanelProps {
  apiUrl?: string;
  mockMode?: boolean;
}

const sections: SectionDefinition[] = [
  {
    key: "vehicle",
    title: "Vehicle & Timing",
    description: "Lap context and vehicle identifier. simulator_ts is stamped automatically on submit.",
    fields: [
      { name: "vehicle_id", label: "Vehicle ID", type: "text" },
      { name: "lap_number", label: "Lap Number", type: "number", step: "1" },
      { name: "lap_distance_m", label: "Lap Distance (m)", type: "number", step: "0.1" },
    ],
  },
  {
    key: "driver",
    title: "Speed & Driver Inputs",
    description: "Vehicle speed and direct driver controls.",
    fields: [
      { name: "speed_kph", label: "Speed (kph)", type: "number", step: "0.1" },
      { name: "motor_rpm", label: "Motor RPM", type: "number", step: "1" },
      { name: "throttle_pct", label: "Throttle (%)", type: "number", step: "0.1" },
      { name: "brake_pct", label: "Brake (%)", type: "number", step: "0.1" },
      { name: "steering_angle_deg", label: "Steering Angle (deg)", type: "number", step: "0.1" },
    ],
  },
  {
    key: "battery",
    title: "Battery",
    description: "Charge state and electrical pack behavior.",
    fields: [
      { name: "battery_soc_pct", label: "Battery SoC (%)", type: "number", step: "0.1" },
      { name: "battery_voltage_v", label: "Battery Voltage (V)", type: "number", step: "0.01" },
      { name: "battery_current_a", label: "Battery Current (A)", type: "number", step: "0.1" },
      { name: "battery_temp_c", label: "Battery Temp (C)", type: "number", step: "0.1" },
      { name: "ambient_temp_c", label: "Ambient Temp (C)", type: "number", step: "0.1" },
    ],
  },
  {
    key: "powertrain",
    title: "Powertrain Temps",
    description: "Thermal readings that map directly to backend alerts.",
    fields: [
      { name: "motor_temp_c", label: "Motor Temp (C)", type: "number", step: "0.1" },
      { name: "inverter_temp_c", label: "Inverter Temp (C)", type: "number", step: "0.1" },
      { name: "coolant_temp_c", label: "Coolant Temp (C)", type: "number", step: "0.1" },
    ],
  },
  {
    key: "brakes",
    title: "Brakes & Tires",
    description: "Hydraulic brake pressure and four-corner tire temperatures.",
    fields: [
      { name: "brake_pressure_front_bar", label: "Front Brake Pressure (bar)", type: "number", step: "0.1" },
      { name: "brake_pressure_rear_bar", label: "Rear Brake Pressure (bar)", type: "number", step: "0.1" },
      { name: "tire_fl_temp_c", label: "Tire FL Temp (C)", type: "number", step: "0.1" },
      { name: "tire_fr_temp_c", label: "Tire FR Temp (C)", type: "number", step: "0.1" },
      { name: "tire_rl_temp_c", label: "Tire RL Temp (C)", type: "number", step: "0.1" },
      { name: "tire_rr_temp_c", label: "Tire RR Temp (C)", type: "number", step: "0.1" },
    ],
  },
  {
    key: "motion",
    title: "Motion & GPS",
    description: "Vehicle accelerations and local GPS position.",
    fields: [
      { name: "acceleration_x_g", label: "Accel X (g)", type: "number", step: "0.001" },
      { name: "acceleration_y_g", label: "Accel Y (g)", type: "number", step: "0.001" },
      { name: "acceleration_z_g", label: "Accel Z (g)", type: "number", step: "0.001" },
      { name: "latitude_deg", label: "Latitude", type: "number", step: "0.000001" },
      { name: "longitude_deg", label: "Longitude", type: "number", step: "0.000001" },
    ],
  },
];

const statusCopy: Record<SubmissionState, string> = {
  idle: "Ready to send a telemetry packet.",
  success: "Telemetry submitted. Waiting for backend broadcast to refresh the dashboard.",
  error: "Telemetry submission failed. Check the backend connection and try again.",
};

export function TelemetryInputPanel({
  apiUrl = appConfig.apiUrl,
  mockMode = appConfig.useMockData,
}: TelemetryInputPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<TelemetryInputFormValues>(
    createDefaultTelemetryFormValues,
  );
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDisabled = mockMode || isSubmitting;
  const statusClassName = useMemo(
    () => `telemetry-input__status telemetry-input__status--${submissionState}`,
    [submissionState],
  );

  function handleNumericChange(name: FieldName, value: string): void {
    setValues(
      (current) =>
        ({
          ...current,
          [name]: value === "" ? 0 : Number(value),
        }) as TelemetryInputFormValues,
    );
    if (submissionState !== "idle") {
      setSubmissionState("idle");
      setStatusDetail("");
    }
  }

  function handleTextChange(name: FieldName, value: string): void {
    setValues(
      (current) =>
        ({
          ...current,
          [name]: value,
        }) as TelemetryInputFormValues,
    );
    if (submissionState !== "idle") {
      setSubmissionState("idle");
      setStatusDetail("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (mockMode) {
      setSubmissionState("error");
      setStatusDetail("Browser input requires VITE_USE_MOCK_DATA=false and a live backend.");
      return;
    }

    setIsSubmitting(true);
    setSubmissionState("idle");
    setStatusDetail("");

    try {
      const payload = buildTelemetrySubmitPayload(values);
      const response = await fetch(`${apiUrl}/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed with ${response.status}`);
      }

      setSubmissionState("success");
      setStatusDetail("Backend accepted the packet. Live charts will update through the socket.");
    } catch (error) {
      setSubmissionState("error");
      setStatusDetail(error instanceof Error ? error.message : "Unknown submission error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRandomize(): void {
    setValues(generateRandomTelemetryFormValues());
    setSubmissionState("idle");
    setStatusDetail("");
  }

  return (
    <section className="panel telemetry-input" aria-labelledby="telemetry-input-heading">
      <div className="panel__header telemetry-input__header">
        <div>
          <h2 id="telemetry-input-heading">Browser Telemetry Input</h2>
          <p>Submit a manual packet to the real backend and let the existing WebSocket flow update the dashboard.</p>
        </div>
        <button
          type="button"
          className="telemetry-input__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          Data Input
        </button>
      </div>

      {!expanded ? null : (
        <div className="telemetry-input__body">
          {mockMode ? (
            <div className="telemetry-input__guard" role="alert">
              Browser input requires <code>VITE_USE_MOCK_DATA=false</code> and an active backend/WebSocket connection.
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <fieldset className="telemetry-input__fieldset" disabled={isDisabled}>
              {sections.map((section, index) => (
                <details
                  className="telemetry-input__accordion"
                  key={section.key}
                  open={index === 0}
                >
                  <summary>{section.title}</summary>
                  <p className="telemetry-input__section-copy">{section.description}</p>
                  <div className="telemetry-input__grid">
                    {section.fields.map((field) => {
                      const fieldId = `telemetry-input-${field.name}`;
                      const value = values[field.name];

                      return (
                        <label className="telemetry-input__field" htmlFor={fieldId} key={field.name}>
                          <span>{field.label}</span>
                          <input
                            id={fieldId}
                            name={field.name}
                            type={field.type}
                            step={field.step}
                            value={field.type === "text" ? String(value) : String(value)}
                            onChange={(event) => {
                              if (field.type === "text") {
                                handleTextChange(field.name, event.target.value);
                                return;
                              }

                              handleNumericChange(field.name, event.target.value);
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </details>
              ))}
            </fieldset>

            <div className="telemetry-input__actions">
              <button
                type="button"
                className="telemetry-input__button telemetry-input__button--secondary"
                onClick={handleRandomize}
                disabled={isDisabled}
              >
                Generate Random
              </button>
              <button
                type="submit"
                className="telemetry-input__button telemetry-input__button--primary"
                disabled={isDisabled}
              >
                {isSubmitting ? "Submitting..." : "Submit Packet"}
              </button>
            </div>
          </form>

          <p className={statusClassName} role="status">
            <strong>{submissionState}</strong>
            <span>{statusDetail || statusCopy[submissionState]}</span>
          </p>
        </div>
      )}
    </section>
  );
}
