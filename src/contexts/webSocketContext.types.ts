export type WSMessage = { type: string; [key: string]: unknown };

export type Listener = (msg: WSMessage) => void;

export type TimeSyncMessage = {
  type: "send-time-sync";
  clientSentAt?: unknown;
  clientSentPerf?: unknown;
  serverNow?: unknown;
};

export type WebSocketWithCleanup = WebSocket & { __cleanupSync?: () => void };

export interface WebSocketContextType {
  isSocketReady: boolean;
  sendJson: (payload: object) => void;
  subscribe: (listener: Listener) => () => void;
  nowMs: () => number;
  nowFromPerfMs: () => number;
  perfNowMs: () => number;
  lastSyncAgeMs: () => number;
}
