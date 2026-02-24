import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "../../../contexts/WebSocketContext";
import type { Player } from "../../../types/Lobby";
import type { BoardData, Clue } from "../../../../shared/types/board.ts";
import type {
  ActiveBoard,
  AnswerCaptureStartMsg,
  AnswerProcessingMsg,
  AnswerResultMsg,
  AnswerTranscriptMsg,
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
  DailyDoubleWagerHeardMsg,
  DailyDoubleWagerLockedMsg,
  TtsReady,
  UseGameSocketSyncArgs,
} from "./useGameSocketSync.types.ts";
import { routeGameSocketMessage } from "./useGameSocketSync.router.ts";
export type {
  AnswerCaptureStartMsg,
  AnswerProcessingMsg,
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
} from "./useGameSocketSync.types.ts";

// ---------- helpers ----------
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

function makeAiHostAssetPayload(args: {
  seq: number;
  assetId: string;
  startedAtMs?: number | null;
  offsetMs: number;
}): string {
  const startedAt = Number.isFinite(args.startedAtMs ?? NaN) ? Number(args.startedAtMs) : 0;
  const receivedAt = Date.now();
  return `${args.seq}::${args.assetId}::${startedAt}::${Math.max(0, Math.round(args.offsetMs))}::${receivedAt}`;
}

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
  const [hasBuzzedCurrentClue, setHasBuzzedCurrentClue] = useState(false);
  const lockoutTimeoutRef = useRef<number | null>(null);
  const currentClueKeyRef = useRef<string | null>(null);

  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  const [timerDuration, setTimerDuration] = useState<number>(0);
  const timerVersionRef = useRef<number>(0);

  const [isFinalJeopardy, setIsFinalJeopardy] = useState(false);
  const [allWagersSubmitted, setAllWagersSubmitted] = useState(false);
  const [wagers, setWagers] = useState<Record<string, number>>({});
  const [finalPlacements, setFinalPlacements] = useState<string[]>([]);
  const [finalWagers, setFinalWagers] = useState<Record<string, number>>({});
  const [finalWagerDrawings, setFinalWagerDrawings] = useState<Record<string, string>>({});
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

  const [ddWagerCapture, setDdWagerCapture] = useState<DailyDoubleWagerCaptureStartMsg | null>(
    null,
  );
  const [ddWagerHeard, setDdWagerHeard] = useState<DailyDoubleWagerHeardMsg | null>(null);
  const [ddWagerLocked, setDdWagerLocked] = useState<DailyDoubleWagerLockedMsg | null>(null);
  const [ddWagerError, setDdWagerError] = useState<string | null>(null);
  const [showDdModal, setShowDdModal] = useState<DailyDoubleShowModalMsg | null>(null);
  const [showWager, setShowWager] = useState<boolean>(false);

  const [answerProcessing, setAnswerProcessing] = useState<AnswerProcessingMsg | null>(null);

  const aiHostSeqRef = useRef<number>(0);
  const aiHostPlaybackHydrationRef = useRef<string | null>(null);

  const clearDdWagerUi = () => {
    setDdWagerCapture(null);
    setDdWagerHeard(null);
    setDdWagerLocked(null);
    setDdWagerError(null);
  };

  const getClueKey = useCallback((clue?: Pick<Clue, "value" | "question"> | null) => {
    if (!clue) return null;
    const value = String(clue.value ?? "");
    const question = String(clue.question ?? "").trim();
    if (!question) return null;
    return `${value}:${question}`;
  }, []);

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

  useEffect(() => {
    if (!isSocketReady) return;

    return subscribe((message) => {
      routeGameSocketMessage(message as { type?: string; [key: string]: unknown }, {
        gameId,
        myUsername,
        nowMs,
        applyLockoutUntil,
        resetLocalTimerState,
        clearDdWagerUi,
        clearAnswerUi,
        getClueKey,
        makeAiHostAssetPayload,
        currentClueKeyRef,
        timerVersionRef,
        aiHostSeqRef,
        aiHostPlaybackHydrationRef,
        setHost,
        setPlayers,
        setScores,
        setBoardData,
        setActiveBoard,
        setSelectedClue,
        setClearedClues,
        setBoardSelectionLocked,
        setBuzzerLocked,
        setBuzzResult,
        setBuzzResultDisplay,
        setHasBuzzedCurrentClue,
        setTimerEndTime,
        setTimerDuration,
        setIsFinalJeopardy,
        setAllWagersSubmitted,
        setWagers,
        setFinalPlacements,
        setFinalWagers,
        setFinalWagerDrawings,
        setSelectedFinalist,
        setFinalists,
        setDrawings,
        setIsGameOver,
        setNarrationEnabled,
        setTtsReady,
        setAnswerCapture,
        setAnswerTranscript,
        setAnswerResult,
        setAnswerError,
        setPhase,
        setSelectorKey,
        setSelectorName,
        setAiHostText,
        setAiHostAsset,
        setDdWagerCapture,
        setDdWagerHeard,
        setDdWagerLocked,
        setDdWagerError,
        setShowDdModal,
        setShowWager,
        setAnswerProcessing,
      });
    });
  }, [
    isSocketReady,
    subscribe,
    applyLockoutUntil,
    resetLocalTimerState,
    gameId,
    nowMs,
    getClueKey,
    myUsername,
  ]);

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
    [gameId, sendJson, isFinalJeopardy, allWagersSubmitted, wagers],
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
    hasBuzzedCurrentClue,

    timerEndTime,
    timerDuration,

    isFinalJeopardy,
    allWagersSubmitted,
    wagers,
    finalPlacements,
    finalWagers,
    finalWagerDrawings,
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
