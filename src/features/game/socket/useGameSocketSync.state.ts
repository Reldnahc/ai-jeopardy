import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "../../../types/Lobby.ts";
import type { BoardData, Clue } from "../../../../shared/types/board.ts";
import {
  createInitialBoardData,
  getSocketClueKey,
  makeAiHostAssetPayload,
  normalizeSocketUsername,
} from "./useGameSocketSync.helpers.ts";
import type { GameSocketRouterDeps } from "./useGameSocketSync.router.shared.ts";
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
  UseGameSocketSyncResult,
} from "./useGameSocketSync.types.ts";

type RouterBaseDeps = Omit<GameSocketRouterDeps, "gameId" | "myUsername" | "nowMs">;

type GameSocketSyncState = Omit<UseGameSocketSyncResult, "isSocketReady" | "markAllCluesComplete">;

export function useGameSocketSyncState(myUsername: string): {
  state: GameSocketSyncState;
  routerBaseDeps: RouterBaseDeps;
} {
  const [host, setHost] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [boardData, setBoardData] = useState<BoardData>(() => createInitialBoardData());

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
  const [showWager, setShowWager] = useState(false);

  const [answerProcessing, setAnswerProcessing] = useState<AnswerProcessingMsg | null>(null);

  const aiHostSeqRef = useRef<number>(0);
  const aiHostPlaybackHydrationRef = useRef<string | null>(null);

  const clearDdWagerUi = useCallback(() => {
    setDdWagerCapture(null);
    setDdWagerHeard(null);
    setDdWagerLocked(null);
    setDdWagerError(null);
  }, []);

  const getClueKey = useCallback((clue?: Pick<Clue, "value" | "question"> | null) => {
    return getSocketClueKey(clue);
  }, []);

  const resetLocalTimerState = useCallback(() => {
    setTimerEndTime(null);
    setTimerDuration(0);
  }, []);

  const clearAnswerUi = useCallback(() => {
    setAnswerCapture(null);
    setAnswerTranscript(null);
    setAnswerResult(null);
    setAnswerError(null);
    setBuzzResult(null);
    setBuzzResultDisplay(null);
  }, []);

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
    const normalizedHost = normalizeSocketUsername(host);
    return Boolean(normalizedHost && myUsername && normalizedHost === myUsername);
  }, [host, myUsername]);

  const routerBaseDeps = useMemo<RouterBaseDeps>(
    () => ({
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
    }),
    [applyLockoutUntil, clearAnswerUi, clearDdWagerUi, getClueKey, resetLocalTimerState],
  );

  return {
    state: {
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
      finalists,
      drawings,
      isGameOver,
      narrationEnabled,
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
      answerProcessing,
    },
    routerBaseDeps,
  };
}
