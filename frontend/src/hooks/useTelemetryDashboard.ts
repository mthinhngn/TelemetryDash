import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { appConfig } from "../config";
import { mergeReadings, normalizeHistory, prependAlerts } from "../lib/dashboardState";
import type { ConnectionStatus, TelemetryClient } from "../lib/telemetryClient";
import type { AlertEvent, TelemetryReading } from "../types/telemetry";

interface DashboardState {
  alerts: AlertEvent[];
  connectionStatus: ConnectionStatus;
  latestReading: TelemetryReading | null;
  readings: TelemetryReading[];
  errorMessage: string | null;
}

const INITIAL_STATE: DashboardState = {
  alerts: [],
  connectionStatus: "idle",
  latestReading: null,
  readings: [],
  errorMessage: null,
};

export function useTelemetryDashboard(client: TelemetryClient): DashboardState {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const reconnectTimerRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const connectToStreamRef = useRef<(isReconnect: boolean) => void>(() => undefined);

  useEffect(() => {
    function scheduleReconnect(): void {
      if (reconnectTimerRef.current !== null) {
        return;
      }

      reconnectAttemptRef.current += 1;
      const delay = Math.min(
        appConfig.reconnectBaseDelayMs * reconnectAttemptRef.current,
        appConfig.reconnectMaxDelayMs,
      );

      setState((current) => ({
        ...current,
        connectionStatus: "reconnecting",
      }));

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectToStreamRef.current(true);
      }, delay);
    }

    connectToStreamRef.current = (isReconnect: boolean) => {
      if (isUnmountedRef.current) {
        return;
      }

      client.connect({
        onStatusChange: (connectionStatus) => {
          setState((current) => ({
            ...current,
            connectionStatus:
              isReconnect && connectionStatus === "connecting"
                ? "reconnecting"
                : connectionStatus,
          }));

          if (connectionStatus === "connected") {
            reconnectAttemptRef.current = 0;
          }

          if (
            connectionStatus === "disconnected" &&
            !manualDisconnectRef.current &&
            !isUnmountedRef.current
          ) {
            scheduleReconnect();
          }
        },
        onMessage: (message) => {
          startTransition(() => {
            setState((current) => {
              switch (message.type) {
                case "history_init": {
                  const readings = mergeReadings(
                    current.readings,
                    message.readings,
                    appConfig.chartBufferSize,
                  );

                  return {
                    ...current,
                    readings,
                    latestReading: readings.at(-1) ?? current.latestReading,
                    alerts: prependAlerts(current.alerts, message.alerts, 10),
                  };
                }
                case "telemetry": {
                  const readings = mergeReadings(
                    current.readings,
                    [message.reading],
                    appConfig.chartBufferSize,
                  );

                  return {
                    ...current,
                    readings,
                    latestReading: message.reading,
                  };
                }
                case "alert":
                  return {
                    ...current,
                    alerts: prependAlerts(current.alerts, [message.alert], 10),
                  };
              }
            });
          });
        },
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : "Telemetry stream encountered an error.";
          setState((current) => ({
            ...current,
            errorMessage: message,
          }));
        },
      });
    };

    async function loadInitialHistory(): Promise<void> {
      try {
        setState((current) => ({
          ...current,
          connectionStatus: "connecting",
          errorMessage: null,
        }));

        const history = normalizeHistory(
          await client.fetchHistory({
            minutes: appConfig.historyMinutes,
            limit: appConfig.historyLimit,
          }),
          appConfig.chartBufferSize,
        );

        setState((current) => ({
          ...current,
          readings: history.readings,
          latestReading: history.readings.at(-1) ?? current.latestReading,
          alerts: history.alerts,
        }));

        connectToStreamRef.current(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load telemetry history.";
        setState((current) => ({
          ...current,
          connectionStatus: "disconnected",
          errorMessage: message,
        }));
      }
    }

    void loadInitialHistory();

    return () => {
      isUnmountedRef.current = true;
      manualDisconnectRef.current = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      client.disconnect();
    };
  }, [client]);

  return useMemo(
    () => ({
      ...state,
      latestReading: state.latestReading ?? state.readings.at(-1) ?? null,
    }),
    [state],
  );
}
