import type { BoardData, Clue } from "../../../../shared/types/board.ts";
import type { LobbySettings } from "../../lobby/socket/useLobbySocketSync.tsx";
import type { Player } from "../../../types/Lobby.ts";

export type ActiveBoard = "firstBoard" | "secondBoard" | "finalJeopardy";
export type SelectedClueFromServer = Clue & { isAnswerRevealed?: boolean };

export type AnswerProcessingMsg = {
  type: "answer-processing";
  gameId: string;
  answerSessionId: string;
  username?: string;
  playerName?: string;
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

export type AnswerTranscriptMsg = {
  type: "answer-transcript";
  gameId: string;
  answerSessionId: string;
  username?: string;
  playerName?: string;
  transcript: string;
  isFinal: boolean;
};

export type AnswerResultMsg = {
  type: "answer-result";
  gameId: string;
  answerSessionId: string;
  username?: string;
  displayname?: string;
  transcript: string;
  verdict: "correct" | "incorrect";
  confidence?: number;
  suggestedDelta: number;
};

export type AnswerErrorMsg = {
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

export type DailyDoubleWagerHeardMsg = {
  type: "daily-double-wager-heard";
  gameId: string;
  username?: string;
  displayname?: string;
  transcript: string;
  parsedWager: number | null;
  reason: string | null;
  maxWager: number;
};

export type DailyDoubleWagerLockedMsg = {
  type: "daily-double-wager-locked";
  gameId: string;
  username?: string;
  displayname?: string;
  wager: number;
};

export type DailyDoubleState = {
  playerName?: string;
};

export type GameStateMessage = {
  type: "game-state";
  gameId?: string;
  players: Player[];
  host: string;
  buzzResult?: string | null;
  buzzResultDisplay?: string | null;
  buzzerLocked?: boolean;
  playerBuzzLockoutUntil?: number;
  boardData: BoardData;
  scores?: Record<string, number>;
  clearedClues?: string[];
  selectedClue?: SelectedClueFromServer;
  activeBoard?: ActiveBoard;
  isFinalJeopardy?: boolean;
  finalJeopardyStage?: string | null;
  wagers?: Record<string, number>;
  finalPlacements?: string[];
  finalWagerDrawings?: Record<string, string>;
  finalists?: string[] | null;
  drawings?: Record<string, string> | null;
  timerEndTime?: number | null;
  timerDuration?: number | null;
  timerVersion?: number;
  lobbySettings?: LobbySettings | null;
  phase?: string | null;
  selectorKey?: string | null;
  selectorName?: string | null;
  dailyDouble?: DailyDoubleState | null;
  ddWagerSessionId?: string | null;
  ddWagerDeadlineAt?: number | null;
  ddShowModal?: { username: string; displayname: string; maxWager: number } | null;
  boardSelectionLocked?: boolean | null;
  boardSelectionLockReason?: string | null;
  boardSelectionLockVersion?: number;
  aiHostPlayback?: {
    assetId: string;
    startedAtMs: number;
    durationMs?: number | null;
    elapsedMs?: number;
  } | null;
};

export type UseGameSocketSyncArgs = {
  gameId?: string;
  username: string | null;
};

export type TtsReady = { requestId?: string; assetId: string; url: string };
