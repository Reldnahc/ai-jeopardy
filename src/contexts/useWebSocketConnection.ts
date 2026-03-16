import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTimeSyncRequest,
  getPerfNowMs,
  getTimeSyncOffsets,
  isLiveSocket,
  isTimeSyncMessage,
  parseSocketMessage,
  shouldReconnectSocket,
} from "./webSocketContext.helpers.ts";
import type {
  Listener,
  WebSocketContextType,
  WebSocketWithCleanup,
} from "./webSocketContext.types.ts";

const SYNC_EVERY_MS = 15_000;
const RECONNECT_EVERY_MS = 5_000;
const TOKEN_KEY = "aiJeopardy.jwt";

export function useWebSocketConnection(): WebSocketContextType {
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const queueRef = useRef<string[]>([]);
  const connectingRef = useRef(false);

  const [isSocketReady, setIsSocketReady] = useState(false);

  const serverOffsetMsRef = useRef(0);
  const serverOffsetPerfMsRef = useRef(0);
  const lastSyncPerfRef = useRef(0);

  const perfNowMs = useCallback(() => getPerfNowMs(), []);

  const nowMs = useCallback(() => Date.now() + serverOffsetMsRef.current, []);

  const nowFromPerfMs = useCallback(() => {
    return perfNowMs() + serverOffsetPerfMsRef.current;
  }, [perfNowMs]);

  const lastSyncAgeMs = useCallback(() => {
    const lastSyncPerf = lastSyncPerfRef.current;
    return lastSyncPerf > 0 ? perfNowMs() - lastSyncPerf : Number.POSITIVE_INFINITY;
  }, [perfNowMs]);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const flushQueue = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    if (queueRef.current.length > 0) {
      console.log(`[WS] flushing ${queueRef.current.length} queued messages`);
    }

    for (const message of queueRef.current) {
      socket.send(message);
    }

    queueRef.current = [];
  }, []);

  const applyTimeSyncMessage = useCallback(
    (message: ReturnType<typeof parseSocketMessage>) => {
      if (!message || !isTimeSyncMessage(message)) return;

      const offsets = getTimeSyncOffsets({
        message,
        clientRecvAt: Date.now(),
        clientRecvPerf: perfNowMs(),
      });

      if (offsets.offsetMs !== null) {
        serverOffsetMsRef.current = offsets.offsetMs;
      }

      if (offsets.offsetPerfMs !== null) {
        serverOffsetPerfMsRef.current = offsets.offsetPerfMs;
      }

      if (offsets.lastSyncPerf !== null) {
        lastSyncPerfRef.current = offsets.lastSyncPerf;
      }
    },
    [perfNowMs],
  );

  const attachSocketHandlers = useCallback(
    (socket: WebSocket) => {
      socket.onopen = () => {
        console.log("[WS] connected");
        connectingRef.current = false;

        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
          socket.send(JSON.stringify({ type: "auth", token }));
        }

        const syncClock = () => {
          socket.send(JSON.stringify(buildTimeSyncRequest(perfNowMs())));
        };

        syncClock();

        const syncInterval = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            syncClock();
          }
        }, SYNC_EVERY_MS);

        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible" && socket.readyState === WebSocket.OPEN) {
            syncClock();
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        (socket as WebSocketWithCleanup).__cleanupSync = () => {
          window.clearInterval(syncInterval);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };

        setIsSocketReady(true);
        flushQueue();
      };

      socket.onerror = (error) => {
        console.error("[WS] error:", error);
        setIsSocketReady(false);
      };

      socket.onclose = (event) => {
        console.warn("[WS] closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });

        try {
          (socket as WebSocketWithCleanup).__cleanupSync?.();
        } catch {
          // ignore sync cleanup failures during close
        }

        if (socketRef.current === socket) {
          socketRef.current = null;
          setIsSocketReady(false);
        }

        connectingRef.current = false;
      };

      socket.onmessage = (event) => {
        const message = parseSocketMessage(event.data);
        if (!message) {
          console.warn("[WS] non-JSON message:", event.data);
          return;
        }

        applyTimeSyncMessage(message);

        for (const listener of listenersRef.current) {
          listener(message);
        }
      };
    },
    [applyTimeSyncMessage, flushQueue, perfNowMs],
  );

  const ensureSocket = useCallback(() => {
    const existingSocket = socketRef.current;
    if (isLiveSocket(existingSocket)) {
      return existingSocket;
    }

    if (connectingRef.current) {
      return existingSocket;
    }

    connectingRef.current = true;

    const nextSocket = new WebSocket(import.meta.env.VITE_WS_URL);
    socketRef.current = nextSocket;

    console.log("[WS] initializing:", import.meta.env.VITE_WS_URL);
    attachSocketHandlers(nextSocket);

    return nextSocket;
  }, [attachSocketHandlers]);

  const sendJson = useCallback(
    (payload: object) => {
      const serializedPayload = JSON.stringify(payload);
      const socket = ensureSocket();

      if (!socket) {
        console.warn("[WS] sendJson queued but no socket instance:", payload);
        queueRef.current.push(serializedPayload);
        return;
      }

      if (socket.readyState !== WebSocket.OPEN) {
        console.log("[WS] sendJson queued (not OPEN):", socket.readyState, payload);
        queueRef.current.push(serializedPayload);
        return;
      }

      socket.send(serializedPayload);
    },
    [ensureSocket],
  );

  useEffect(() => {
    ensureSocket();

    return () => {
      const socket = socketRef.current;
      if (socket) {
        socket.close();
      }

      socketRef.current = null;
      setIsSocketReady(false);
      queueRef.current = [];
      connectingRef.current = false;
    };
  }, [ensureSocket]);

  useEffect(() => {
    const reconnectInterval = window.setInterval(() => {
      if (shouldReconnectSocket(socketRef.current)) {
        console.log("[WS] attempting reconnect...");
        ensureSocket();
      }
    }, RECONNECT_EVERY_MS);

    return () => window.clearInterval(reconnectInterval);
  }, [ensureSocket]);

  return useMemo(
    () => ({
      isSocketReady,
      sendJson,
      subscribe,
      nowMs,
      nowFromPerfMs,
      perfNowMs,
      lastSyncAgeMs,
    }),
    [isSocketReady, lastSyncAgeMs, nowFromPerfMs, nowMs, perfNowMs, sendJson, subscribe],
  );
}
