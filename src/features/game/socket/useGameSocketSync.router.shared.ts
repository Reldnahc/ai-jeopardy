import type { MutableRefObject } from "react";
import type { Player } from "../../../types/Lobby.ts";
import type { Clue } from "../../../../shared/types/board.ts";
import type {
  AnswerCaptureStartMsg,
  AnswerProcessingMsg,
  AnswerResultMsg,
  AnswerTranscriptMsg,
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
  DailyDoubleWagerHeardMsg,
  DailyDoubleWagerLockedMsg,
  GameStateMessage,
  TtsReady,
} from "./useGameSocketSync.types.ts";

export type SocketMessage = { type?: string; [key: string]: unknown };

export const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

export type AiHostAssetPayloadArgs = {
  seq: number;
  assetId: string;
  startedAtMs?: number | null;
  offsetMs: number;
};

export type GameSocketRouterDeps = {
  gameId?: string;
  myUsername: string;
  nowMs: () => number;
  applyLockoutUntil: (until: number) => void;
  resetLocalTimerState: () => void;
  clearDdWagerUi: () => void;
  clearAnswerUi: () => void;
  getClueKey: (clue?: Pick<Clue, "value" | "question"> | null) => string | null;
  makeAiHostAssetPayload: (args: AiHostAssetPayloadArgs) => string;
  currentClueKeyRef: MutableRefObject<string | null>;
  timerVersionRef: MutableRefObject<number>;
  aiHostSeqRef: MutableRefObject<number>;
  aiHostPlaybackHydrationRef: MutableRefObject<string | null>;
  setHost: (value: string | null) => void;
  setPlayers: (value: Player[]) => void;
  setScores: (
    value: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>),
  ) => void;
  setBoardData: (value: GameStateMessage["boardData"]) => void;
  setActiveBoard: (value: "firstBoard" | "secondBoard" | "finalJeopardy") => void;
  setSelectedClue: (value: Clue | null) => void;
  setClearedClues: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setBoardSelectionLocked: (value: boolean | null) => void;
  setBuzzerLocked: (value: boolean) => void;
  setBuzzResult: (value: string | null) => void;
  setBuzzResultDisplay: (value: string | null) => void;
  setHasBuzzedCurrentClue: (value: boolean) => void;
  setTimerEndTime: (value: number | null) => void;
  setTimerDuration: (value: number) => void;
  setIsFinalJeopardy: (value: boolean) => void;
  setAllWagersSubmitted: (value: boolean) => void;
  setWagers: (value: Record<string, number>) => void;
  setFinalPlacements: (value: string[]) => void;
  setFinalWagers: (value: Record<string, number>) => void;
  setFinalWagerDrawings: (value: Record<string, string>) => void;
  setSelectedFinalist: (value: string) => void;
  setFinalists: (value: string[]) => void;
  setDrawings: (value: Record<string, string> | null) => void;
  setIsGameOver: (value: boolean) => void;
  setNarrationEnabled: (value: boolean) => void;
  setTtsReady: (value: TtsReady | null) => void;
  setAnswerCapture: (value: AnswerCaptureStartMsg | null) => void;
  setAnswerTranscript: (value: AnswerTranscriptMsg | null) => void;
  setAnswerResult: (value: AnswerResultMsg | null) => void;
  setAnswerError: (value: string | null) => void;
  setPhase: (value: string | null) => void;
  setSelectorKey: (value: string | null) => void;
  setSelectorName: (value: string | null) => void;
  setAiHostText: (value: string | null) => void;
  setAiHostAsset: (value: string | null) => void;
  setDdWagerCapture: (value: DailyDoubleWagerCaptureStartMsg | null) => void;
  setDdWagerHeard: (value: DailyDoubleWagerHeardMsg | null) => void;
  setDdWagerLocked: (value: DailyDoubleWagerLockedMsg | null) => void;
  setDdWagerError: (value: string | null) => void;
  setShowDdModal: (value: DailyDoubleShowModalMsg | null) => void;
  setShowWager: (value: boolean) => void;
  setAnswerProcessing: (value: AnswerProcessingMsg | null) => void;
};
