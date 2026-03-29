export const appConfig = {
  apiUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  wsUrl: import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws",
  useMockData: (import.meta.env.VITE_USE_MOCK_DATA ?? "true") === "true",
  chartBufferSize: 600,
  historyMinutes: 5,
  historyLimit: 1000,
  lapEnergyBudgetWh: 220,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 5000,
};
