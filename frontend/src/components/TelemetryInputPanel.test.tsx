import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultTelemetryFormValues,
  generateRandomTelemetryFormValues,
} from "../lib/telemetryInput";
import { TelemetryInputPanel } from "./TelemetryInputPanel";

describe("TelemetryInputPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the toggle and starts collapsed", () => {
    render(<TelemetryInputPanel apiUrl="http://localhost:8000" mockMode={false} />);

    const toggle = screen.getByRole("button", { name: "Data Input" });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Submit Packet" })).not.toBeInTheDocument();
  });

  it("submits a backend-shaped payload with an auto-generated simulator_ts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T10:15:30.000Z"));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TelemetryInputPanel apiUrl="http://localhost:8000" mockMode={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Data Input" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit Packet" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/telemetry",
      expect.objectContaining({ method: "POST" }),
    );
    expect(payload.simulator_ts).toBe("2026-03-29T10:15:30.000Z");
    expect(payload.vehicle_id).toBe("browser-manual");
    expect(payload.speed_kph).toBe(createDefaultTelemetryFormValues().speed_kph);
    expect(screen.getByRole("status")).toHaveTextContent("success");
  });

  it("generate random populates the form with valid values", () => {
    vi.spyOn(Math, "random").mockImplementation(() => 0.95);

    render(<TelemetryInputPanel apiUrl="http://localhost:8000" mockMode={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Data Input" }));

    const vehicleInput = screen.getByLabelText("Vehicle ID") as HTMLInputElement;
    const speedInput = screen.getByLabelText("Speed (kph)") as HTMLInputElement;

    expect(vehicleInput.value).toBe("browser-manual");

    fireEvent.click(screen.getByRole("button", { name: "Generate Random" }));

    expect(vehicleInput.value).not.toBe("browser-manual");
    expect(speedInput.value).not.toBe(String(createDefaultTelemetryFormValues().speed_kph));
    expect(Number(speedInput.value)).toBeGreaterThan(0);
    expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).not.toBe("");
  });

  it("shows the real-backend-required guard and blocks submit in mock mode", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<TelemetryInputPanel apiUrl="http://localhost:8000" mockMode />);

    fireEvent.click(screen.getByRole("button", { name: "Data Input" }));

    expect(
      screen.getByText(/VITE_USE_MOCK_DATA=false/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Packet" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows success and error submission states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => "Backend exploded",
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<TelemetryInputPanel apiUrl="http://localhost:8000" mockMode={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Data Input" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit Packet" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("success");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit Packet" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("error");
    expect(screen.getByRole("status")).toHaveTextContent("Backend exploded");
  });

  it("streams randomized telemetry packets until stopped", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T10:15:30.000Z"));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TelemetryInputPanel apiUrl="http://localhost:8000" mockMode={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Data Input" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Live Stream" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop Live Stream" })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(950);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);

    fireEvent.click(screen.getByRole("button", { name: "Stop Live Stream" }));
    expect(screen.getByRole("status")).toHaveTextContent("Live stream stopped.");
  });

  it("random generator stays backend-valid without empty required values", () => {
    const generated = generateRandomTelemetryFormValues();

    expect(generated.vehicle_id).not.toBe("");
    expect(Number.isFinite(generated.speed_kph)).toBe(true);
    expect(Number.isFinite(generated.motor_rpm)).toBe(true);
    expect(Number.isFinite(generated.latitude_deg)).toBe(true);
    expect(Number.isFinite(generated.longitude_deg)).toBe(true);
  });
});
