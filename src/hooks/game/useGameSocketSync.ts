import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import type { Player } from "../../types/Lobby";
import type { BoardData, Clue } from "../../../shared/types/board.ts";
import { LobbySettings } from "../lobby/useLobbySocketSync.tsx";
import { preloadAudio, ttsUrl } from "./usePreload.ts";

type ActiveBoard = "firstBoard" | "secondBoard" | "finalJeopardy";
type SelectedClueFromServer = Clue & { isAnswerRevealed?: boolean };

// ---------- helpers ----------
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();



// ---------- message types (updated) ----------
export type AnswerProcessingMsg = {
    type: "answer-processing";
    gameId: string;
    answerSessionId: string;
    username?: string;       // NEW (stable)
    playerName?: string;     // legacy
    stage?: "transcribing" | "judging" | string;
};

export type AnswerCaptureStartMsg = {
    type: "answer-capture-start";
    gameId: string;
    username?: string;
    displayname?: string;
    answerSessionId: string;
    clueKey: string;
    durationMs: number;
    deadlineAt: number;
};

type AnswerTranscriptMsg = {
    type: "answer-transcript";
    gameId: string;
    answerSessionId: string;
    username?: string;
    playerName?: string;
    transcript: string;
    isFinal: boolean;
};

type AnswerResultMsg = {
    type: "answer-result";
    gameId: string;
    answerSessionId: string;
    username?: string;
    displayname?: string;
    transcript: string;
    verdict: "correct" | "incorrect";
    confidence?: number; // some server paths omit this
    suggestedDelta: number;
};

type AnswerErrorMsg = {
    type: "answer-error";
    gameId: string;
    answerSessionId?: string;
    message: string;
};

export type DailyDoubleShowModalMsg = {
    type: "daily-double-show-modal";
    showModal: boolean;
    maxWager: number;
    username?: string;
    displayname?: string;
};

export type DailyDoubleWagerCaptureStartMsg = {
    type: "daily-double-wager-capture-start";
    gameId: string;
    username?: string;
    displayname?: string;
    ddWagerSessionId: string;
    durationMs: number;
    deadlineAt: number;
};

type DailyDoubleWagerHeardMsg = {
    type: "daily-double-wager-heard";
    gameId: string;
    username?: string;
    displayname?: string;
    transcript: string;
    parsedWager: number | null;
    reason: string | null;
    maxWager: number;
};

type DailyDoubleWagerLockedMsg = {
    type: "daily-double-wager-locked";
    gameId: string;
    username?: string;
    displayname?: string;
    wager: number;
};

type GameStateMessage = {
    type: "game-state";
    gameId?: string;

    // should already be [{ username, displayname, ... }]
    players: Player[];
    host: string; // NEW: assume host is username

    buzzResult?: string | null;
    buzzResultDisplay?: string | null;
    buzzerLocked?: boolean;

    playerBuzzLockoutUntil?: number;

    boardData: BoardData;
    scores?: Record<string, number>;
    clearedClues?: string[];

    selectedClue?: SelectedClueFromServer;
    activeBoard?: ActiveBoard;

    // FJ
    isFinalJeopardy?: boolean;
    finalJeopardyStage?: string | null;
    wagers?: Record<string, number>;
    finalists?: string[] | null;
    drawings?: Record<string, string> | null;

    // timers
    timerEndTime?: number | null;
    timerDuration?: number | null;
    timerVersion?: number;

    lobbySettings?: LobbySettings | null;

    // phase / selector
    phase?: string | null;
    selectorKey?: string | null;  // NEW: username
    selectorName?: string | null; // displayname

    // DD
    dailyDouble?: any | null;
    ddWagerSessionId?: string | null;
    ddWagerDeadlineAt?: number | null;
    ddShowModal?: { username: string; displayname: string; maxWager: number } | null;

    boardSelectionLocked?: boolean | null;
    boardSelectionLockReason?: string | null;
    boardSelectionLockVersion?: number;
};

type UseGameSocketSyncArgs = {
    gameId?: string;
    username: string | null; // canonical stable identity
};

type TtsReady = { requestId?: string; assetId: string; url: string };

export function useGameSocketSync({ gameId, username }: UseGameSocketSyncArgs) {
    const { isSocketReady, sendJson, subscribe, nowMs } = useWebSocket();

    const myUsername = norm(username);

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
    const [boardSelectionLocked, setBoardSelectionLocked] = useState<boolean | null>(null);

    const [buzzerLocked, setBuzzerLocked] = useState(true);
    const [buzzResult, setBuzzResult] = useState<string | null>(null);
    const [buzzResultDisplay, setBuzzResultDisplay] = useState<string | null>(null);

    const [buzzLockedOut, setBuzzLockedOut] = useState(false);
    const lockoutTimeoutRef = useRef<number | null>(null);

    const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
    const [timerDuration, setTimerDuration] = useState<number>(0);
    const timerVersionRef = useRef<number>(0);

    const [isFinalJeopardy, setIsFinalJeopardy] = useState(false);
    const [allWagersSubmitted, setAllWagersSubmitted] = useState(false);
    const [wagers, setWagers] = useState<Record<string, number>>({});
    const [finalWagers, setFinalWagers] = useState<Record<string, number>>({});
    const [selectedFinalist, setSelectedFinalist] = useState("");
    const [finalists, setFinalists] = useState<string[]>([""]);

    const [drawings, setDrawings] = useState<Record<string, string> | null>(null);
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

    const [ddWagerCapture, setDdWagerCapture] = useState<DailyDoubleWagerCaptureStartMsg | null>(null);
    const [ddWagerHeard, setDdWagerHeard] = useState<DailyDoubleWagerHeardMsg | null>(null);
    const [ddWagerLocked, setDdWagerLocked] = useState<DailyDoubleWagerLockedMsg | null>(null);
    const [ddWagerError, setDdWagerError] = useState<string | null>(null);
    const [showDdModal, setShowDdModal] = useState<DailyDoubleShowModalMsg | null>(null);
    const [showWager, setShowWager] = useState<boolean>(false);

    const [answerProcessing, setAnswerProcessing] = useState<AnswerProcessingMsg | null>(null);

    const aiHostSeqRef = useRef<number>(0);

    const clearDdWagerUi = () => {
        setDdWagerCapture(null);
        setDdWagerHeard(null);
        setDdWagerLocked(null);
        setDdWagerError(null);
    };

    const resetLocalTimerState = useCallback(() => {
        setTimerEndTime(null);
        setTimerDuration(0);
    }, []);

    const clearAnswerUi = () => {
        setAnswerCapture(null);
        setAnswerTranscript(null);
        setAnswerResult(null);
        setAnswerError(null);
        setBuzzResult(null);
        setBuzzResultDisplay(null);
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

    // Host is now username-based
    const isHost = useMemo(() => {
        const h = norm(host);
        return Boolean(h && myUsername && h === myUsername);
    }, [host, myUsername]);

    // join-game whenever socket is ready (username-based)
    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId || !myUsername) return;

        sendJson({ type: "join-game", gameId, username: myUsername });
    }, [isSocketReady, gameId, myUsername, sendJson]);

    useEffect(() => {
        if (!isSocketReady) return;

        return subscribe((message) => {
            // snapshot hydration
            if (message.type === "game-state") {
                const m = message as GameStateMessage;

                if (typeof m.playerBuzzLockoutUntil === "number") {
                    applyLockoutUntil(m.playerBuzzLockoutUntil);
                }

                setPlayers(m.players);
                setHost(m.host);
                setBuzzResult(m.buzzResult ?? null);
                setBuzzResultDisplay(m.buzzResultDisplay ?? null);
                setBoardData(m.boardData);
                setScores(m.scores ?? {});
                setBuzzerLocked(Boolean(m.buzzerLocked));
                setNarrationEnabled(Boolean(m.lobbySettings?.narrationEnabled));
                setPhase(m.phase ?? null);
                setSelectorKey(m.selectorKey ?? null);
                setSelectorName(m.selectorName ?? null);
                setBoardSelectionLocked(m.boardSelectionLocked ?? null);

                if (Array.isArray(m.clearedClues)) setClearedClues(new Set(m.clearedClues));
                if (m.activeBoard) setActiveBoard(m.activeBoard);

                const fj = m.activeBoard === "finalJeopardy" || m.isFinalJeopardy;
                setIsFinalJeopardy(Boolean(fj));

                if (fj) {
                    const snapWagers = m.wagers ?? {};
                    setWagers(snapWagers);

                    const stage = m.finalJeopardyStage ?? null;
                    const submitted = stage !== "wager" && stage != null;
                    setAllWagersSubmitted(submitted);

                    setFinalists(Array.isArray(m.finalists) ? m.finalists : [""]);
                    if (submitted) setFinalWagers(snapWagers);
                    setDrawings(m.drawings ?? null);
                } else {
                    setAllWagersSubmitted(false);
                    setWagers({});
                    setFinalWagers({});
                    setFinalists([""]);
                    setDrawings(null);
                }

                if (m.phase === "DD_WAGER_CAPTURE" && m.dailyDouble) {
                    if (m.ddShowModal) {
                        setShowDdModal({
                            type: "daily-double-show-modal",
                            showModal: true,
                            username: m.ddShowModal.username,
                            displayname: m.ddShowModal.displayname,
                            maxWager: m.ddShowModal.maxWager,
                        });
                    }

                    if (m.ddWagerSessionId && typeof m.ddWagerDeadlineAt === "number") {
                        const durationMs = Math.max(0, m.ddWagerDeadlineAt - nowMs());
                        setDdWagerCapture({
                            type: "daily-double-wager-capture-start",
                            gameId: gameId ?? "",
                            playerName: m.dailyDouble.playerName,
                            ddWagerSessionId: m.ddWagerSessionId,
                            durationMs,
                            deadlineAt: m.ddWagerDeadlineAt,
                        } as any);
                        setDdWagerHeard(null);
                        setDdWagerLocked(null);
                        setDdWagerError(null);
                    }
                } else {
                    setShowDdModal(null);
                    clearDdWagerUi();
                }

                if (m.selectedClue && m.phase !== "DD_WAGER_CAPTURE") {
                    setSelectedClue({
                        ...(m.selectedClue as Clue),
                        showAnswer: Boolean(m.selectedClue.isAnswerRevealed),
                    });
                } else {
                    setSelectedClue(null);
                }

                if (typeof m.timerVersion === "number") timerVersionRef.current = m.timerVersion;

                if (typeof m.timerEndTime === "number" && m.timerEndTime > nowMs()) {
                    setTimerEndTime(m.timerEndTime);
                    setTimerDuration(typeof m.timerDuration === "number" ? m.timerDuration : 0);
                } else {
                    resetLocalTimerState();
                }

                if (m.phase !== "DD_WAGER_CAPTURE") clearDdWagerUi();
                return;
            }

            if (message.type === "buzz-denied") {
                const m = message as unknown as { lockoutUntil: number };
                applyLockoutUntil(Number(m.lockoutUntil || 0));
                return;
            }

            if (message.type === "answer-processing") {
                setAnswerProcessing(message as AnswerProcessingMsg);
                return;
            }

            if (message.type === "answer-capture-start") {
                const m = message as AnswerCaptureStartMsg;
                setAnswerCapture(m);
                setAnswerTranscript(null);
                setAnswerResult(null);
                setAnswerError(null);
                return;
            }

            if (message.type === "answer-transcript") {
                setAnswerProcessing(null);
                setAnswerTranscript(message as AnswerTranscriptMsg);
                return;
            }

            if (message.type === "answer-result") {
                setAnswerProcessing(null);
                setAnswerResult(message as AnswerResultMsg);
                return;
            }

            if (message.type === "answer-error") {
                const m = message as AnswerErrorMsg;
                setAnswerProcessing(null);
                setAnswerError(String(m.message || "Answer error"));
                return;
            }

            if (message.type === "daily-double-show-modal") {
                setShowDdModal(message as DailyDoubleShowModalMsg);
                return;
            }

            if (message.type === "daily-double-hide-modal") {
                setShowDdModal(null);
                return;
            }

            if (message.type === "daily-double-wager-parse-failed") {
                const m = message as { reason?: string; attempts?: number; maxAttempts?: number };
                setDdWagerError(`Didn't catch that (${m.reason ?? "unknown"}). Try again.`);
                return;
            }

            if (message.type === "daily-double-wager-capture-start") {
                const m = message as DailyDoubleWagerCaptureStartMsg;
                setDdWagerCapture(m);
                setDdWagerHeard(null);
                setDdWagerLocked(null);
                setDdWagerError(null);
                return;
            }

            if (message.type === "daily-double-wager-heard") {
                setDdWagerHeard(message as DailyDoubleWagerHeardMsg);
                return;
            }

            if (message.type === "daily-double-wager-locked") {
                setDdWagerLocked(message as DailyDoubleWagerLockedMsg);
                setDdWagerCapture(null);
                return;
            }

            if (message.type === "daily-double-error") {
                const m = message as unknown as { message?: string };
                setDdWagerError(String(m.message || "Daily Double error"));
                return;
            }

            if (message.type === "reveal-finalist-wager") {
                setShowWager(true);
                return;
            }

            if (message.type === "final-jeopardy") {
                setActiveBoard("finalJeopardy");
                setIsFinalJeopardy(true);
                setAllWagersSubmitted(false);
                setWagers({});
                setSelectedClue(null);
                setBuzzResult(null);
                setBuzzResultDisplay(null);
                resetLocalTimerState();
                return;
            }

            if (message.type === "cleared-clues-sync") {
                const m = message as { type: "cleared-clues-sync"; clearedClues: string[] };
                setClearedClues(new Set(m.clearedClues ?? []));
                return;
            }

            if (message.type === "phase-changed") {
                const m = message as { phase?: string | null; selectorKey?: string | null; selectorName?: string | null };
                setPhase(m.phase ?? null);
                setSelectorKey(m.selectorKey ?? null);
                setSelectorName(m.selectorName ?? null);
                return;
            }

            if (message.type === "all-wagers-submitted") {
                const m = message as unknown as { wagers: Record<string, number>; finalists: string[] };
                setAllWagersSubmitted(true);
                setWagers(m.wagers);
                setFinalWagers(m.wagers);
                setFinalists(m.finalists);
                return;
            }

            if (message.type === "player-list-update") {
                const m = message as unknown as { players: Player[]; host: string };
                // host is username now; don't sort by displayname
                setPlayers(m.players);
                setHost(m.host);
                return;
            }

            if (message.type === "buzz-result") {
                const m = message as unknown as { username: string, displayname: string };
                setBuzzResult(m.username);
                setBuzzResultDisplay(m.displayname);
                resetLocalTimerState();
                return;
            }

            if (message.type === "ai-host-say") {
                const m = message as { text?: string; assetId?: string };

                const assetId = typeof m.assetId === "string" ? m.assetId.trim() : "";
                if (assetId) {
                    aiHostSeqRef.current += 1;
                    setAiHostAsset(`${aiHostSeqRef.current}::${assetId}`);
                    return;
                }

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
                clearDdWagerUi();
                return;
            }

            if (message.type === "reset-buzzer") {
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

            if (message.type === "preload-final-jeopardy-asset") {
                const m = message as unknown as { assetId: string };
                void preloadAudio(ttsUrl(m.assetId));
                return;
            }

            if (message.type === "lobby-settings-updated") {
                const m = message as { lobbySettings?: { narrationEnabled?: boolean } | null };
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
                const m = message as { clue?: SelectedClueFromServer };
                if (m.clue) setSelectedClue({ ...(m.clue as Clue), showAnswer: true });
                resetLocalTimerState();
                return;
            }

            if (message.type === "all-clues-cleared") {
                const m = message as { clearedClues?: string[] };
                if (Array.isArray(m.clearedClues)) setClearedClues(new Set(m.clearedClues));
                return;
            }

            if (message.type === "clue-cleared") {
                const m = message as unknown as { clueId: string };
                setClearedClues((prev) => new Set(prev).add(m.clueId));
                return;
            }

            if (message.type === "board-selection-unlocked") {
                setBoardSelectionLocked(false);
                return;
            }

            if (message.type === "returned-to-board") {
                const m = message as { boardSelectionLocked?: boolean };
                setSelectedClue(null);
                setBuzzResult(null);
                setBuzzResultDisplay(null);
                setAnswerCapture(null);
                setAnswerTranscript(null);
                setAnswerResult(null);
                setAnswerError(null);
                setAiHostText(null);
                clearDdWagerUi();
                setBoardSelectionLocked(m.boardSelectionLocked ?? null);
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

            if (message.type === "display-finalist") {
                const m = message as unknown as { finalist: string };
                setShowWager(false);
                setSelectedFinalist(m.finalist);
                return;
            }

            if (message.type === "update-score") {
                const m = message as unknown as { username: string; score: number };
                setScores((prev) => ({ ...prev, [m.username]: m.score }));
                return;
            }

            if (message.type === "update-scores") {
                const m = message as unknown as { scores: Record<string, number> };
                setScores(m.scores);
                return;
            }

            if (message.type === "all-drawings-submitted") {
                const m = message as unknown as { drawings: Record<string, string> };
                setDrawings(m.drawings);
                return;
            }

            if (message.type === "final-score-screen") {
                setIsGameOver(true);
                return;
            }
        });
    }, [isSocketReady, subscribe, applyLockoutUntil, resetLocalTimerState, gameId, nowMs]);

    const markAllCluesComplete = useCallback(() => {
        if (!gameId) return;
        sendJson({ type: "mark-all-complete", gameId });
    }, [gameId, sendJson]);

    const updateScore = useCallback(
        (player: string, delta: number, lastQuestionValue: number) => {
            if (!gameId) return;

            if (isFinalJeopardy && allWagersSubmitted) {
                const w = Math.abs(wagers[player] ?? 0);
                delta = delta < 0 ? -w : w;
            } else {
                void lastQuestionValue;
            }

            sendJson({ type: "update-score", gameId, username: player, delta });
        },
        [gameId, sendJson, isFinalJeopardy, allWagersSubmitted, wagers]
    );

    const leaveGame = useCallback(() => {
        if (!gameId || !myUsername) return;
        sendJson({ type: "leave-game", gameId, username: myUsername });
    }, [gameId, myUsername, sendJson]);

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
        buzzResultDisplay,
        buzzLockedOut,

        timerEndTime,
        timerDuration,

        isFinalJeopardy,
        allWagersSubmitted,
        wagers,
        finalWagers,
        selectedFinalist,

        drawings,
        isGameOver,

        markAllCluesComplete,
        updateScore,
        leaveGame,

        narrationEnabled,
        requestTts: () => null, // you can keep your existing requestTts code if needed
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

        boardSelectionLocked,

        ddWagerCapture,
        ddWagerHeard,
        ddWagerLocked,
        ddWagerError,
        showDdModal,
        showWager,
        finalists,
        answerProcessing,
    };
}
