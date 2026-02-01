import React, {
    createContext, useContext, useRef, useEffect, useState,
    useCallback, useMemo
} from "react";
import {supabase} from "../supabaseClient.ts";
type WSMessage = { type: string; [key: string]: unknown };
type Listener = (msg: WSMessage) => void;

interface WebSocketContextType {
    isSocketReady: boolean;
    sendJson: (payload: object) => void;
    subscribe: (listener: Listener) => () => void;
    setLobbyPresence: (presence: { gameId: string; playerId: string } | null) => void;
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
            (async () => {
                const { data } = await supabase.auth.getSession();
                const token = data.session?.access_token;
                if (token) {
                    ws.send(JSON.stringify({ type: "auth", accessToken: token }));
                }
            })();

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

            // Only clear if THIS ws is still the active one
            if (socketRef.current === ws) {
                socketRef.current = null;
                setIsSocketReady(false);
                //listenersRef.current.clear();
            }
            connectingRef.current = false;
        };

        ws.onmessage = (event) => {
            let parsed: any;
            try {
                parsed = JSON.parse(event.data);
            } catch {
                console.warn("[WS] non-JSON message:", event.data);
                return;
            }

            if (parsed?.type === "rtt-ping" && typeof parsed.t === "number") {
                try {
                    ws.send(
                        JSON.stringify({
                            type: "rtt-pong",
                            t: parsed.t,
                        })
                    );
                } catch {
                    // socket may be closing; ignore
                }
                return; // IMPORTANT: do not pass to app logic
            }

            if (
                typeof parsed !== "object" ||
                parsed === null ||
                !("type" in parsed) ||
                typeof (parsed as { type?: unknown }).type !== "string"
            ) return;

            const msg = parsed as WSMessage;
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
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            const ws = socketRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) return;

            const token = session?.access_token;
            if (token) {
                ws.send(JSON.stringify({ type: "auth", accessToken: token }));
            }
        });

        return () => sub.subscription.unsubscribe();
    }, []);


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
        setLobbyPresence
    }), [isSocketReady, sendJson, setLobbyPresence, subscribe]);

    return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) throw new Error("useWebSocket must be used within a WebSocketProvider");
    return context;
};
