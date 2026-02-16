import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import type { Player } from "../../types/Lobby";
import type {BoardData, Clue} from "../../../shared/types/board.ts";
import {LobbySettings} from "../lobby/useLobbySocketSync.tsx";
import {preloadAudio, ttsUrl} from "./usePreload.ts";

type ActiveBoard = "firstBoard" | "secondBoard" | "finalJeopardy";

type SelectedClueFromServer = Clue & { isAnswerRevealed?: boolean };

export type AnswerProcessingMsg = {
    type: "answer-processing";
    gameId: string;
    answerSessionId: string;
    playerName: string;
    stage?: "transcribing" | "judging" | string;
};

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

export type DailyDoubleShowModalMsg = {
    type: "daily-double-show-modal";
    showModal: boolean;
    maxWager: number;
    playerName: string;

}
export type DailyDoubleWagerCaptureStartMsg = {
    type: "daily-double-wager-capture-start";
    gameId: string;
    playerName: string;
    ddWagerSessionId: string;
    durationMs: number;
    deadlineAt: number;
};

type DailyDoubleWagerHeardMsg = {
    type: "daily-double-wager-heard";
    gameId: string;
    playerName: string;
    transcript: string;
    parsedWager: number | null;
    reason: string | null;
    maxWager: number;
};

type DailyDoubleWagerLockedMsg = {
    type: "daily-double-wager-locked";
    gameId: string;
    playerName: string;
    wager: number;
};

type GameStateMessage = {
    type: "game-state";
    gameId?: string;

    players: Player[];
    host: string;

    buzzResult?: string | null;
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
    selectorKey?: string | null;
    selectorName?: string | null;

    // DD
    dailyDouble?: any | null; // ideally type this
    ddWagerSessionId?: string | null;
    ddWagerDeadlineAt?: number | null;
    ddShowModal?: { playerName: string; maxWager: number } | null;

    boardSelectionLocked?: boolean | null;
    boardSelectionLockReason?: string | null;
    boardSelectionLockVersion?: number;
};


type UseGameSocketSyncArgs = {
    gameId?: string;
    playerName: string | null; // effectivePlayerName
};

type TtsReady = { requestId?: string; assetId: string; url: string };

export function useGameSocketSync({ gameId, playerName }: UseGameSocketSyncArgs) {
    const { isSocketReady, sendJson, subscribe, nowMs } = useWebSocket();

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
                if (typeof m.playerBuzzLockoutUntil === "number") {
                    applyLockoutUntil(m.playerBuzzLockoutUntil);
                }
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
                setBoardSelectionLocked(m.boardSelectionLocked ?? null);

                if (Array.isArray(m.clearedClues)) {
                    setClearedClues(new Set(m.clearedClues));
                }

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
                    // Re-show the modal (your UI expects a DailyDoubleShowModalMsg-ish object)
                    if (m.ddShowModal) {
                        setShowDdModal({
                            type: "daily-double-show-modal",
                            showModal: true,
                            playerName: m.ddShowModal.playerName,
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
                        });
                        setDdWagerHeard(null);
                        setDdWagerLocked(null);
                        setDdWagerError(null);
                    }
                } else {
                    setShowDdModal(null);
                    clearDdWagerUi();
                }


                if (m.selectedClue && m.phase !== "DD_WAGER_CAPTURE" ) {
                    setSelectedClue({ ...(m.selectedClue as Clue), showAnswer: Boolean(m.selectedClue.isAnswerRevealed) });
                } else {
                    setSelectedClue(null);
                }

                if (typeof m.timerVersion === "number") {
                    timerVersionRef.current = m.timerVersion;
                }

                if (typeof m.timerEndTime === "number" && m.timerEndTime > nowMs()) {
                    setTimerEndTime(m.timerEndTime);
                    setTimerDuration(typeof m.timerDuration === "number" ? m.timerDuration : 0);
                } else {
                    resetLocalTimerState();
                }

                if (m.phase !== "DD_WAGER_CAPTURE") {
                    clearDdWagerUi();
                }

                return;
            }

            if (message.type === "buzz-denied") {
                const m = message as unknown as { lockoutUntil: number };
                applyLockoutUntil(Number(m.lockoutUntil || 0));
                return;
            }

            if (message.type === "answer-processing") {
                const m = message as unknown as AnswerProcessingMsg;
                setAnswerProcessing(m);
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
                setAnswerProcessing(null);
                setAnswerTranscript(m);
                return;
            }

            if (message.type === "answer-result") {
                const m = message as unknown as AnswerResultMsg;
                setAnswerProcessing(null);
                setAnswerResult(m);
                return;
            }

            if (message.type === "answer-error") {
                const m = message as unknown as AnswerErrorMsg;
                setAnswerProcessing(null);
                setAnswerError(String(m.message || "Answer error"));
                return;
            }

            if (message.type === "daily-double-show-modal") {
                const m = message as unknown as DailyDoubleShowModalMsg;
                setShowDdModal(m);

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
                const m = message as unknown as DailyDoubleWagerCaptureStartMsg;
                setDdWagerCapture(m);
                setDdWagerHeard(null);
                setDdWagerLocked(null);
                setDdWagerError(null);
                return;
            }

            if (message.type === "daily-double-wager-heard") {
                const m = message as unknown as DailyDoubleWagerHeardMsg;
                setDdWagerHeard(m);
                return;
            }

            if (message.type === "daily-double-wager-locked") {
                const m = message as unknown as DailyDoubleWagerLockedMsg;
                setDdWagerLocked(m);
                // once locked, we can clear the capture UI (or keep it if you want to show what was heard)
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
                const m = message as unknown as { wagers: Record<string, number>, finalists: string[] };
                setAllWagersSubmitted(true);
                setWagers(m.wagers);
                setFinalWagers(m.wagers);
                setFinalists(m.finalists);
                return;
            }

            if (message.type === "player-list-update") {
                const m = message as unknown as { players: Player[]; host: string };
                const sorted = [...m.players].sort((a, b) => (a.displayname === m.host ? -1 : b.displayname === m.host ? 1 : 0));
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
                clearDdWagerUi();
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

            if (message.type === "preload-final-jeopardy-asset") {
                const m = message as unknown as { assetId: string;};
                void preloadAudio(ttsUrl(m.assetId));
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

            if (message.type === "board-selection-unlocked") {
                setBoardSelectionLocked(false);
                return;
            }

            if (message.type === "returned-to-board") {
                const m = message as unknown as { boardSelectionLocked?: boolean };
                setSelectedClue(null);
                setBuzzResult(null);
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
                const m = message as unknown as { player: string; score: number };

                setScores(prev => ({
                    ...prev,
                    [m.player]: m.score,
                }));

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
    }, [isSocketReady, subscribe, applyLockoutUntil, resetLocalTimerState, isHost, gameId, sendJson]);

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
        finalWagers,
        selectedFinalist,

        drawings,
        isGameOver,
        // actions
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
        boardSelectionLocked,

        ddWagerCapture,
        ddWagerHeard,
        ddWagerLocked,
        ddWagerError,
        showDdModal,
        showWager,
        finalists,
        answerProcessing
    };
}
