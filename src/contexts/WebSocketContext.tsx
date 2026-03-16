import { createContext, useContext, type ReactNode } from "react";
import { useWebSocketConnection } from "./useWebSocketConnection.ts";
import type { WebSocketContextType } from "./webSocketContext.types.ts";

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const value = useWebSocketConnection();
  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
