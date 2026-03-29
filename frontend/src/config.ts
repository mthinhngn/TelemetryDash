function resolveApiUrl(): string {
  return import.meta.env.VITE_API_URL ?? "http://localhost:8000";
}

function resolveWsUrl(apiUrl: string): string {
  const configuredWsUrl = import.meta.env.VITE_WS_URL;
  if (configuredWsUrl) {
    if (window.location.protocol === "https:" && configuredWsUrl.startsWith("ws://")) {
      return configuredWsUrl.replace(/^ws:\/\//, "wss://");
    }
    return configuredWsUrl;
  }

  if (apiUrl.startsWith("https://")) {
    return `${apiUrl.replace(/^https:\/\//, "wss://")}/ws`;
  }

  if (apiUrl.startsWith("http://")) {
    return `${apiUrl.replace(/^http:\/\//, "ws://")}/ws`;
  }

  return "ws://localhost:8000/ws";
}

const apiUrl = resolveApiUrl();

export const appConfig = {
  apiUrl,
  wsUrl: resolveWsUrl(apiUrl),
  useMockData: (import.meta.env.VITE_USE_MOCK_DATA ?? "false") === "true",
  chartBufferSize: 600,
  historyMinutes: 5,
  historyLimit: 1000,
  historyRefreshIntervalMs: 2000,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 5000,
  websocketConnectTimeoutMs: 4000,
};
