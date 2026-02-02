import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import type { Player } from "../../types/Lobby";
import type {BoardData, Clue} from "../../types";
import type { DrawingPath } from "../../utils/drawingUtils";
import {LobbySettings} from "../lobby/useLobbySocketSync.tsx";

type ActiveBoard = "firstBoard" | "secondBoard" | "finalJeopardy";

type SelectedClueFromServer = Clue & { isAnswerRevealed?: boolean };

type AnswerCaptureStartMsg = {
    type: "answer-capture-start";
    gameId: string;
    playerName: string;
    answerSessionId: string;
    clueKey: string;
    durationMs: number;
    deadlineAt: number;
};

type AnswerTranscriptMsg = {
    type: "answer-transcript";
    gameId: string;
    answerSessionId: string;
    playerName: string;
    transcript: string;
    isFinal: boolean;
};

type AnswerResultMsg = {
    type: "answer-result";
    gameId: string;
    answerSessionId: string;
    playerName: string;
    transcript: string;
    verdict: "correct" | "incorrect";
    confidence: number;
    suggestedDelta: number;
};

type AnswerErrorMsg = {
    type: "answer-error";
    gameId: string;
    answerSessionId?: string;
    message: string;
};

type GameStateMessage = {
    type: "game-state";
    players: Player[];
    host: string;
    buzzerLocked?: boolean;
    buzzResult?: string | null;
    boardData: BoardData;
    scores?: Record<string, number>;
    clearedClues?: string[];
    selectedClue?: SelectedClueFromServer;
    activeBoard?: ActiveBoard;
    isFinalJeopardy?: boolean;
    finalJeopardyStage?: string | null;
    wagers?: Record<string, number>;
    timerEndTime?: number | null;
    timerDuration?: number | null;
    timerVersion?: number;
    lobbySettings?: LobbySettings | null;
    phase?: string | null;
    selectorKey?: string | null;
    selectorName?: string | null;
};

type UseGameSocketSyncArgs = {
    gameId?: string;
    playerName: string | null; // effectivePlayerName
};

type TtsReady = { requestId?: string; assetId: string; url: string };

export function useGameSocketSync({ gameId, playerName }: UseGameSocketSyncArgs) {
    const { isSocketReady, sendJson, subscribe } = useWebSocket();

    const [host, setHost] = useState<string | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [boardData, setBoardData] = useState<BoardData>({
        firstBoard: { categories: [{ category: "", values: [] }] },
        secondBoard: { categories: [{ category: "", values: [] }] },
        finalJeopardy: { categories: [{ category: "", values: [] }] },
    });

    const [activeBoard, setActiveBoard] = useState<ActiveBoard>("firstBoard");
    const [selectedClue, setSelectedClue] = useState<Clue | null>(null);
    const [clearedClues, setClearedClues] = useState<Set<string>>(new Set());

    const [buzzerLocked, setBuzzerLocked] = useState(true);
    const [buzzResult, setBuzzResult] = useState<string | null>(null);

    const [buzzLockedOut, setBuzzLockedOut] = useState(false);
    const lockoutTimeoutRef = useRef<number | null>(null);

    const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
    const [timerDuration, setTimerDuration] = useState<number>(0);
    const timerVersionRef = useRef<number>(0);

    const [isFinalJeopardy, setIsFinalJeopardy] = useState(false);
    const [allWagersSubmitted, setAllWagersSubmitted] = useState(false);
    const [wagers, setWagers] = useState<Record<string, number>>({});
    const [drawings, setDrawings] = useState<Record<string, DrawingPath[]> | null>(null);
    const [isGameOver, setIsGameOver] = useState(false);

    const [narrationEnabled, setNarrationEnabled] = useState(false);
    const [ttsReady, setTtsReady] = useState<TtsReady | null>(null);

    const [answerCapture, setAnswerCapture] = useState<AnswerCaptureStartMsg | null>(null);
    const [answerTranscript, setAnswerTranscript] = useState<AnswerTranscriptMsg | null>(null);
    const [answerResult, setAnswerResult] = useState<AnswerResultMsg | null>(null);
    const [answerError, setAnswerError] = useState<string | null>(null);

    const [phase, setPhase] = useState<string | null>(null);
    const [selectorKey, setSelectorKey] = useState<string | null>(null);
    const [selectorName, setSelectorName] = useState<string | null>(null);

    const [aiHostText, setAiHostText] = useState<string | null>(null);
    const [aiHostAsset, setAiHostAsset] = useState<string | null>(null);

    const aiHostSeqRef = useRef<number>(0);

    const makeRequestId = () =>
        (globalThis.crypto && "randomUUID" in globalThis.crypto)
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const requestTts = useCallback((args: { text: string; textType?: "text" | "ssml"; voiceId?: string }) => {
        if (!gameId) return null;

        const requestId = makeRequestId();
        sendJson({
            type: "tts-ensure",
            gameId,
            requestId,
            text: args.text,
            textType: args.textType || "text",
            voiceId: args.voiceId || "Matthew",
        });

        return requestId;
    }, [gameId, sendJson]);

    const resetBuzzer = useCallback(() => {
        if (!gameId) return;
        sendJson({ type: "reset-buzzer", gameId });
    }, [gameId, sendJson]);

    const lockBuzzer = useCallback(() => {
        if (!gameId) return;
        sendJson({ type: "lock-buzzer", gameId });
    }, [gameId, sendJson]);

    const unlockBuzzer = useCallback(() => {
        if (!gameId) return;
        sendJson({ type: "unlock-buzzer", gameId });
    }, [gameId, sendJson]);

    const boardDataRef = useRef(boardData);
    useEffect(() => {
        boardDataRef.current = boardData;
    }, [boardData]);

    const resetLocalTimerState = useCallback(() => {
        setTimerEndTime(null);
        setTimerDuration(0);
    }, []);

    const clearAnswerUi = () => {
        setAnswerCapture(null);
        setAnswerTranscript(null);
        setAnswerResult(null);
        setAnswerError(null);
        // also allow re-buzz
        setBuzzResult(null);
    };

    const applyLockoutUntil = useCallback((until: number) => {
        if (lockoutTimeoutRef.current) {
            window.clearTimeout(lockoutTimeoutRef.current);
            lockoutTimeoutRef.current = null;
        }

        const now = Date.now();
        if (until > now) {
            setBuzzLockedOut(true);
            lockoutTimeoutRef.current = window.setTimeout(() => {
                setBuzzLockedOut(false);
                lockoutTimeoutRef.current = null;
            }, until - now);
        } else {
            setBuzzLockedOut(false);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (lockoutTimeoutRef.current) window.clearTimeout(lockoutTimeoutRef.current);
        };
    }, []);

    const isHost = useMemo(() => {
        const h = (host ?? "").trim();
        const you = (playerName ?? "").trim();
        return h.length > 0 && you.length > 0 && h === you;
    }, [host, playerName]);

    // join-game whenever socket is ready
    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId || !playerName) return;

        sendJson({ type: "join-game", gameId, playerName });
    }, [isSocketReady, gameId, playerName, sendJson]);

    useEffect(() => {
        if (!isSocketReady) return;

        return subscribe((message) => {
            // snapshot hydration
            if (message.type === "game-state") {
                const m = message as GameStateMessage;

                setPlayers(m.players);
                setHost(m.host);
                setBuzzResult(m.buzzResult ?? null);
                setBoardData(m.boardData);
                setScores(m.scores ?? {});
                setBuzzerLocked(Boolean(m.buzzerLocked));
                setNarrationEnabled(Boolean(m.lobbySettings?.narrationEnabled));
                setPhase(m.phase ?? null);
                setSelectorKey(m.selectorKey ?? null);
                setSelectorName(m.selectorName ?? null);

                if (Array.isArray(m.clearedClues)) {
                    setClearedClues(new Set(m.clearedClues));
                }

                if (m.activeBoard) setActiveBoard(m.activeBoard);

                const fj = m.activeBoard === "finalJeopardy" || m.isFinalJeopardy;
                setIsFinalJeopardy(Boolean(fj));

                if (fj) {
                    setWagers(m.wagers ?? {});
                    setAllWagersSubmitted(m.finalJeopardyStage !== "wager");
                }

                if (m.selectedClue) {
                    setSelectedClue({ ...(m.selectedClue as Clue), showAnswer: Boolean(m.selectedClue.isAnswerRevealed) });
                } else {
                    setSelectedClue(null);
                }

                if (typeof m.timerVersion === "number") {
                    timerVersionRef.current = m.timerVersion;
                }

                if (typeof m.timerEndTime === "number" && m.timerEndTime > Date.now()) {
                    setTimerEndTime(m.timerEndTime);
                    setTimerDuration(typeof m.timerDuration === "number" ? m.timerDuration : 0);
                } else {
                    resetLocalTimerState();
                }

                return;
            }

            if (message.type === "buzz-denied") {
                const m = message as unknown as { lockoutUntil: number };
                applyLockoutUntil(Number(m.lockoutUntil || 0));
                return;
            }

            if (message.type === "answer-capture-start") {
                const m = message as unknown as AnswerCaptureStartMsg;
                setAnswerCapture(m);
                setAnswerTranscript(null);
                setAnswerResult(null);
                setAnswerError(null);
                return;
            }

            if (message.type === "answer-transcript") {
                const m = message as unknown as AnswerTranscriptMsg;
                setAnswerTranscript(m);
                return;
            }

            if (message.type === "answer-result") {
                const m = message as unknown as AnswerResultMsg;
                setAnswerResult(m);
                // keep answerCapture so UI can still show who answered; you can clear later on return-to-board
                return;
            }

            if (message.type === "answer-error") {
                const m = message as unknown as AnswerErrorMsg;
                setAnswerError(String(m.message || "Answer error"));
                return;
            }

            if (message.type === "final-jeopardy") {
                setActiveBoard("finalJeopardy");
                setIsFinalJeopardy(true);
                setAllWagersSubmitted(false);
                setWagers({});
                setSelectedClue(null);
                setBuzzResult(null);
                resetLocalTimerState();
                return;
            }
            if (message.type === "cleared-clues-sync") {
                const m = message as { type: "cleared-clues-sync"; clearedClues: string[] };
                setClearedClues(new Set(m.clearedClues ?? []));
                return;
            }
            if (message.type === "phase-changed") {
                const m = message as unknown as {
                    phase?: string | null;
                    selectorKey?: string | null;
                    selectorName?: string | null;
                };
                setPhase(m.phase ?? null);
                setSelectorKey(m.selectorKey ?? null);
                setSelectorName(m.selectorName ?? null);
                return;
            }
            if (message.type === "all-wagers-submitted") {
                const m = message as unknown as { wagers: Record<string, number> };
                setAllWagersSubmitted(true);
                setWagers(m.wagers);

                const finalClue = boardDataRef.current.finalJeopardy?.categories?.[0]?.values?.[0];
                if (finalClue && isHost && gameId) {
                    sendJson({ type: "clue-selected", gameId, clue: finalClue });
                }
                return;
            }

            if (message.type === "player-list-update") {
                const m = message as unknown as { players: Player[]; host: string };
                const sorted = [...m.players].sort((a, b) => (a.name === m.host ? -1 : b.name === m.host ? 1 : 0));
                setPlayers(sorted);
                setHost(m.host);
                return;
            }

            if (message.type === "buzz-result") {
                const m = message as unknown as { playerName: string };
                setBuzzResult(m.playerName);
                resetLocalTimerState();
                return;
            }

            if (message.type === "ai-host-say") {
                const m = message as unknown as { text?: string; assetId?: string };

                // Prefer pre-generated asset playback when available
                const assetId = typeof m.assetId === "string" ? m.assetId.trim() : "";
                if (assetId) {
                    aiHostSeqRef.current += 1;
                    setAiHostAsset(`${aiHostSeqRef.current}::${assetId}`);
                    return;
                }

                // Fallback to text-based TTS flow
                const text = String(m.text || "").trim();
                if (!text) return;

                aiHostSeqRef.current += 1;
                setAiHostText(`${aiHostSeqRef.current}::${text}`);
                return;
            }


            if (message.type === "buzzer-locked") {
                setBuzzerLocked(true);
                return;
            }
            if (message.type === "buzzer-unlocked") {
                setBuzzerLocked(false);
                return;
            }

            if (message.type === "buzzer-ui-reset") {
                clearAnswerUi();
                resetLocalTimerState();
                return;
            }

            if (message.type === "reset-buzzer") {
                // This is the HOST reset flow (server will also send buzzer-locked).
                // Do UI cleanup but do NOT force buzzerLocked here.
                clearAnswerUi();
                resetLocalTimerState();
                return;
            }

            if (message.type === "tts-ready") {
                const m = message as unknown as { requestId?: string; assetId: string; url: string };
                setTtsReady({ requestId: m.requestId, assetId: m.assetId, url: m.url });
                return;
            }

            if (message.type === "tts-error") {
                console.error(message);
                return;
            }

            if (message.type === "lobby-settings-updated") {
                const m = message as unknown as { lobbySettings?: { narrationEnabled?: boolean } | null };
                setNarrationEnabled(Boolean(m.lobbySettings?.narrationEnabled));
                return;
            }

            if (message.type === "clue-selected") {
                const m = message as unknown as { clue: SelectedClueFromServer; clearedClues?: string[] };
                setSelectedClue({ ...(m.clue as Clue), showAnswer: Boolean(m.clue.isAnswerRevealed) });
                if (m.clearedClues) setClearedClues(new Set(m.clearedClues));
                return;
            }

            if (message.type === "timer-start") {
                const m = message as unknown as { endTime: number; duration: number; timerVersion: number };
                timerVersionRef.current = m.timerVersion;
                setTimerEndTime(m.endTime);
                setTimerDuration(m.duration);
                return;
            }

            if (message.type === "timer-end") {
                const m = message as unknown as { timerVersion: number };
                if (m.timerVersion === timerVersionRef.current) resetLocalTimerState();
                return;
            }

            if (message.type === "answer-revealed") {
                const m = message as unknown as { clue?: SelectedClueFromServer };
                if (m.clue) setSelectedClue({ ...(m.clue as Clue), showAnswer: true });
                resetLocalTimerState();
                return;
            }

            if (message.type === "all-clues-cleared") {
                const m = message as unknown as { clearedClues?: string[] };
                if (Array.isArray(m.clearedClues)) setClearedClues(new Set(m.clearedClues));
                return;
            }

            if (message.type === "clue-cleared") {
                const m = message as unknown as { clueId: string };
                setClearedClues((prev) => new Set(prev).add(m.clueId));
                return;
            }

            if (message.type === "returned-to-board") {
                setSelectedClue(null);
                setBuzzResult(null);
                setAnswerCapture(null);
                setAnswerTranscript(null);
                setAnswerResult(null);
                setAnswerError(null);
                setAiHostText(null);
                resetLocalTimerState();
                return;
            }

            if (message.type === "transition-to-second-board") {
                setActiveBoard("secondBoard");
                setIsFinalJeopardy(false);
                setAllWagersSubmitted(false);
                setWagers({});
                return;
            }

            if (message.type === "update-scores") {
                const m = message as unknown as { scores: Record<string, number> };
                setScores(m.scores);
                return;
            }

            if (message.type === "all-final-jeopardy-drawings-submitted") {
                const m = message as unknown as { drawings: Record<string, DrawingPath[]> };
                setDrawings(m.drawings);
                return;
            }

            if (message.type === "game-over") {
                setIsGameOver(true);
                return;
            }
        });
    }, [isSocketReady, subscribe, applyLockoutUntil, resetLocalTimerState, isHost, gameId, sendJson]);

    // outbound actions (page uses these)
    const buzz = useCallback(() => {
        if (!gameId) return;
        if (buzzResult || buzzLockedOut) return;
        sendJson({ type: "buzz", gameId });
    }, [gameId, buzzResult, buzzLockedOut, sendJson]);

    const clueSelected = useCallback(
        (clue: Clue) => {
            if (!isHost) return;
            if (!gameId) return;
            sendJson({ type: "clue-selected", gameId, clue });
        },
        [isHost, gameId, sendJson]
    );

    const markAllCluesComplete = useCallback(() => {
        if (!gameId) return;
        sendJson({ type: "mark-all-complete", gameId });
    }, [gameId, sendJson]);

    const updateScore = useCallback(
        (player: string, delta: number, lastQuestionValue: number) => {
            if (!gameId) return;

            // FJ: +/- wager instead of lastQuestionValue
            if (isFinalJeopardy && allWagersSubmitted) {
                const w = Math.abs(wagers[player] ?? 0);
                delta = delta < 0 ? -w : w;
            } else {
                // keep the caller’s delta (it already contains +/- lastQuestionValue in your UI)
                // lastQuestionValue is passed for potential future needs, but not used here.
                void lastQuestionValue;
            }

            sendJson({ type: "update-score", gameId, player, delta });
        },
        [gameId, sendJson, isFinalJeopardy, allWagersSubmitted, wagers]
    );

    const leaveGame = useCallback(() => {
        if (!gameId || !playerName) return;
        sendJson({ type: "leave-game", gameId, playerName });
    }, [gameId, playerName, sendJson]);

    return {
        isSocketReady,
        isHost,

        host,
        players,
        scores,

        boardData,
        activeBoard,

        selectedClue,
        clearedClues,

        buzzerLocked,
        buzzResult,
        buzzLockedOut,
        resetBuzzer,
        lockBuzzer,
        unlockBuzzer,

        timerEndTime,
        timerDuration,

        isFinalJeopardy,
        allWagersSubmitted,
        wagers,

        drawings,
        isGameOver,
        // actions
        buzz,
        clueSelected,
        markAllCluesComplete,
        updateScore,
        leaveGame,

        narrationEnabled,
        requestTts,
        ttsReady,

        answerCapture,
        answerTranscript,
        answerResult,
        answerError,
        phase,
        selectorKey,
        selectorName,
        aiHostText,
        aiHostAsset,
    };
}
