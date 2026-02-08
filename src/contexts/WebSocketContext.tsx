import React, {
    createContext, useContext, useRef, useEffect, useState,
    useCallback, useMemo
} from "react";
type WSMessage = { type: string; [key: string]: unknown };
type Listener = (msg: WSMessage) => void;

interface WebSocketContextType {
    isSocketReady: boolean;
    sendJson: (payload: object) => void;
    subscribe: (listener: Listener) => () => void;
    setLobbyPresence: (presence: { gameId: string; playerId: string } | null) => void;
    nowMs: () => number;            // Date-based server-now
    nowFromPerfMs: () => number;    // perf-based server-now
    perfNowMs: () => number;
    lastSyncAgeMs: () => number;    // optional guard
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const socketRef = useRef<WebSocket | null>(null);
    const listenersRef = useRef(new Set<Listener>());

    // queued JSON strings waiting for OPEN
    const queueRef = useRef<string[]>([]);
    const connectingRef = useRef(false);

    const [isSocketReady, setIsSocketReady] = useState(false);
    const lastLobbyRef = useRef<{ gameId: string; playerId: string } | null>(null);

    const serverOffsetMsRef = useRef(0);
    const serverOffsetPerfMsRef = useRef(0);
    const lastSyncPerfRef = useRef(0);

    const perfNowMs = useCallback(() => {
        // safe in browser; if you ever SSR this, guard it
        return typeof performance !== "undefined" ? performance.now() : 0;
    }, []);

    const nowMs = useCallback(() => Date.now() + serverOffsetMsRef.current, []);
    const nowFromPerfMs = useCallback(() => perfNowMs() + serverOffsetPerfMsRef.current, [perfNowMs]);

    const lastSyncAgeMs = useCallback(() => {
        const nowP = perfNowMs();
        const last = lastSyncPerfRef.current;
        return last > 0 ? (nowP - last) : Number.POSITIVE_INFINITY;
    }, [perfNowMs]);

    // const { profile, error } = useProfile();
    // const { loading } = useAuth();

    const subscribe = useCallback((listener: Listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
    }, []);


    const setLobbyPresence = useCallback((presence: { gameId: string; playerId: string } | null) => {
        lastLobbyRef.current = presence;
    }, []);

    const flushQueue = useCallback(() => {
        const s = socketRef.current;
        if (!s || s.readyState !== WebSocket.OPEN) return;

        if (queueRef.current.length > 0) {
            console.log(`[WS] flushing ${queueRef.current.length} queued messages`);
        }

        for (const msg of queueRef.current) s.send(msg);
        queueRef.current = [];
    }, []);

    const attachSocketHandlers = useCallback((ws: WebSocket) => {
        ws.onopen = () => {
            console.log("[WS] connected");
            connectingRef.current = false;
            // Authenticate this socket with Supabase access token
            const token = localStorage.getItem("aiJeopardy.jwt");
            if (token) {
                ws.send(JSON.stringify({ type: "auth", token }));
            }

            // periodic resync (keeps drift + mobile background weirdness from hurting buzzer fairness)
            const SYNC_EVERY_MS = 15_000;

            let syncInterval: number | null = null;

            const doSync = () => {
                const clientSentAt = Date.now();
                const clientSentPerf = perfNowMs();
                ws.send(JSON.stringify({ type: "request-time-sync", clientSentAt, clientSentPerf }));
            };

            doSync();
            syncInterval = window.setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) doSync();
            }, SYNC_EVERY_MS);

            const onVis = () => {
                if (document.visibilityState === "visible" && ws.readyState === WebSocket.OPEN) {
                    doSync();
                }
            };
            document.addEventListener("visibilitychange", onVis);

            (ws as any).__cleanupSync = () => {
                if (syncInterval) window.clearInterval(syncInterval);
                document.removeEventListener("visibilitychange", onVis);
            };



            setIsSocketReady(true);
            flushQueue();
        };

        ws.onerror = (err) => {
            console.error("[WS] error:", err);
            // do not null socket here; onclose will handle lifecycle
            setIsSocketReady(false);
        };

        ws.onclose = (e) => {
            console.warn("[WS] closed", { code: e.code, reason: e.reason, wasClean: e.wasClean });
            try { (ws as any).__cleanupSync?.(); } catch {
                //ignore
            }

            // Only clear if THIS ws is still the active one
            if (socketRef.current === ws) {
                socketRef.current = null;
                setIsSocketReady(false);
                //listenersRef.current.clear();
            }
            connectingRef.current = false;
        };

        ws.onmessage = (event) => {
            let parsed: unknown;
            try {
                parsed = JSON.parse(event.data);
            } catch {
                console.warn("[WS] non-JSON message:", event.data);
                return;
            }

            if (
                typeof parsed !== "object" ||
                parsed === null ||
                !("type" in parsed) ||
                typeof (parsed as { type?: unknown }).type !== "string"
            ) return;

            const msg = parsed as WSMessage;

            if (msg.type === "send-time-sync") {
                const clientSentAt = Number((msg as any).clientSentAt || 0);
                const clientSentPerf = Number((msg as any).clientSentPerf || 0);
                const serverNow = Number((msg as any).serverNow || 0);

                const clientRecvAt = Date.now();
                const clientRecvPerf = perfNowMs();

                if (clientSentAt > 0 && serverNow > 0) {
                    const midpointDate = (clientSentAt + clientRecvAt) / 2;
                    serverOffsetMsRef.current = serverNow - midpointDate;
                }

                if (clientSentPerf > 0 && serverNow > 0) {
                    const midpointPerf = (clientSentPerf + clientRecvPerf) / 2;
                    serverOffsetPerfMsRef.current = serverNow - midpointPerf;
                    lastSyncPerfRef.current = clientRecvPerf;
                }
            }

            for (const listener of listenersRef.current) listener(msg);
        };
    }, [flushQueue]);

    const ensureSocket = useCallback(() => {
        const existing = socketRef.current;

        // If we have a live socket (OPEN or CONNECTING), keep it.
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
            return existing;
        }

        // Avoid spamming reconnections if multiple sends happen in the same tick
        if (connectingRef.current) return existing;

        connectingRef.current = true;

        const wsUrl = import.meta.env.VITE_WS_URL;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        console.log("[WS] initializing:", wsUrl);
        attachSocketHandlers(ws);

        return ws;
    }, [attachSocketHandlers]);

    const sendJson = useCallback((payload: object) => {
        const msg = JSON.stringify(payload);

        const ws = ensureSocket();

        if (!ws) {
            console.warn("[WS] sendJson queued but no socket instance:", payload);
            queueRef.current.push(msg);
            return;
        }

        if (ws.readyState !== WebSocket.OPEN) {
            console.log("[WS] sendJson queued (not OPEN):", ws.readyState, payload);
            queueRef.current.push(msg);
            return;
        }

        ws.send(msg);
    }, [ensureSocket]);

    // Create socket on mount (optional, but good UX)
    useEffect(() => {
        ensureSocket();
        return () => {
            const ws = socketRef.current;
            if (ws) ws.close();
            socketRef.current = null;
            setIsSocketReady(false);
            //listenersRef.current.clear();
            queueRef.current = [];
            connectingRef.current = false;
        };
    }, [ensureSocket]);

    useEffect(() => {
        const interval = setInterval(() => {
            const ws = socketRef.current;

            // Reconnect if fully closed or missing
            if (!ws || ws.readyState === WebSocket.CLOSED) {
                console.log("[WS] attempting reconnect...");
                ensureSocket();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [ensureSocket]);

    const value = useMemo<WebSocketContextType>(() => ({
        isSocketReady,
        sendJson,
        subscribe,
        setLobbyPresence,
        nowMs,
        nowFromPerfMs,
        perfNowMs,
        lastSyncAgeMs
    }), [isSocketReady, lastSyncAgeMs, nowFromPerfMs, nowMs, perfNowMs, sendJson, setLobbyPresence, subscribe]);

    return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) throw new Error("useWebSocket must be used within a WebSocketProvider");
    return context;
};
