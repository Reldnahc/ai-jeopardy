import { isPlayerListUpdateMessage, isLobbyPlayerSummary } from "../../../../shared/types/lobby.ts";
import type {
  AnswerCaptureStartMsg,
  AnswerErrorMsg,
  AnswerProcessingMsg,
  AnswerResultMsg,
  AnswerTranscriptMsg,
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
  DailyDoubleWagerHeardMsg,
  DailyDoubleWagerLockedMsg,
  GameStateMessage,
  SelectedClueFromServer,
  TtsReady,
} from "./useGameSocketSync.types.ts";
import type { SocketMessage } from "./useGameSocketSync.router.shared.ts";

type AiHostSayMessage = {
  type: "ai-host-say";
  text?: string;
  assetId?: string;
  startedAtMs?: number;
  durationMs?: number;
  elapsedMs?: number;
};

type TtsReadyMessage = TtsReady & { type: "tts-ready" };

type PreloadFinalJeopardyAssetMessage = {
  type: "preload-final-jeopardy-asset";
  assetId: string;
};

type BuzzDeniedMessage = {
  type: "buzz-denied";
  lockoutUntil: number;
  reason?: string;
};

type FinalJeopardyMessage = {
  type: "final-jeopardy";
  finalists?: string[];
};

type ClearedCluesSyncMessage = {
  type: "cleared-clues-sync";
  clearedClues: string[];
};

type PhaseChangedMessage = {
  type: "phase-changed";
  phase?: string | null;
  selectorKey?: string | null;
  selectorName?: string | null;
};

type AllWagersSubmittedMessage = {
  type: "all-wagers-submitted";
  wagers: Record<string, number>;
  finalists: string[];
  wagerDrawings?: Record<string, string>;
};

type BuzzResultMessage = {
  type: "buzz-result";
  username: string;
  displayname: string;
};

type ClueSelectedMessage = {
  type: "clue-selected";
  clue: SelectedClueFromServer;
  clearedClues?: string[];
};

type TimerStartMessage = {
  type: "timer-start";
  endTime: number;
  duration: number;
  timerVersion: number;
};

type TimerEndMessage = {
  type: "timer-end";
  timerVersion: number;
};

type AnswerRevealedMessage = {
  type: "answer-revealed";
  clue?: SelectedClueFromServer;
};

type AllCluesClearedMessage = {
  type: "all-clues-cleared";
  clearedClues?: string[];
};

type ClueClearedMessage = {
  type: "clue-cleared";
  clueId: string;
};

type ReturnedToBoardMessage = {
  type: "returned-to-board";
  boardSelectionLocked?: boolean | null;
};

type DisplayFinalistMessage = {
  type: "display-finalist";
  finalist: string;
};

type UpdateScoreMessage = {
  type: "update-score";
  username: string;
  score: number;
};

type UpdateScoresMessage = {
  type: "update-scores";
  scores: Record<string, number>;
};

type AllDrawingsSubmittedMessage = {
  type: "all-drawings-submitted";
  drawings: Record<string, string>;
};

type FinalScoreScreenMessage = {
  type: "final-score-screen";
  finalPlacements?: string[];
};

type DailyDoubleWagerParseFailedMessage = {
  type: "daily-double-wager-parse-failed";
  reason?: string;
};

type DailyDoubleErrorMessage = {
  type: "daily-double-error";
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isFiniteNumber);
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isString);
}

function isSelectedClueFromServer(value: unknown): value is SelectedClueFromServer {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.value) &&
    isString(value.question) &&
    isString(value.answer) &&
    (value.category === undefined || isString(value.category)) &&
    (value.isAnswerRevealed === undefined || isBoolean(value.isAnswerRevealed)) &&
    (value.media === undefined ||
      (isRecord(value.media) &&
        value.media.type === "image" &&
        isString(value.media.assetId)))
  );
}

export function isGameStateMessage(message: SocketMessage): message is GameStateMessage {
  return (
    message.type === "game-state" &&
    Array.isArray(message.players) &&
    message.players.every(isLobbyPlayerSummary) &&
    isString(message.host) &&
    isRecord(message.boardData)
  );
}

export function isAiHostSayMessage(message: SocketMessage): message is AiHostSayMessage {
  return (
    message.type === "ai-host-say" &&
    (message.text === undefined || isString(message.text)) &&
    (message.assetId === undefined || isString(message.assetId)) &&
    (message.startedAtMs === undefined || isFiniteNumber(message.startedAtMs)) &&
    (message.durationMs === undefined || isFiniteNumber(message.durationMs)) &&
    (message.elapsedMs === undefined || isFiniteNumber(message.elapsedMs))
  );
}

export function isTtsReadyMessage(message: SocketMessage): message is TtsReadyMessage {
  return (
    message.type === "tts-ready" &&
    isString(message.assetId) &&
    isString(message.url) &&
    (message.requestId === undefined || isString(message.requestId))
  );
}

export function isPreloadFinalJeopardyAssetMessage(
  message: SocketMessage,
): message is PreloadFinalJeopardyAssetMessage {
  return message.type === "preload-final-jeopardy-asset" && isString(message.assetId);
}

export function isAnswerProcessingMessage(
  message: SocketMessage,
): message is AnswerProcessingMsg {
  return (
    message.type === "answer-processing" &&
    isString(message.gameId) &&
    isString(message.answerSessionId) &&
    (message.username === undefined || isString(message.username)) &&
    (message.playerName === undefined || isString(message.playerName)) &&
    (message.stage === undefined || isString(message.stage))
  );
}

export function isAnswerCaptureStartMessage(
  message: SocketMessage,
): message is AnswerCaptureStartMsg {
  return (
    message.type === "answer-capture-start" &&
    isString(message.gameId) &&
    isString(message.answerSessionId) &&
    isString(message.clueKey) &&
    isFiniteNumber(message.durationMs) &&
    isFiniteNumber(message.deadlineAt) &&
    (message.username === undefined || isString(message.username)) &&
    (message.displayname === undefined || isString(message.displayname))
  );
}

export function isAnswerTranscriptMessage(
  message: SocketMessage,
): message is AnswerTranscriptMsg {
  return (
    message.type === "answer-transcript" &&
    isString(message.gameId) &&
    isString(message.answerSessionId) &&
    isString(message.transcript) &&
    typeof message.isFinal === "boolean" &&
    (message.username === undefined || isString(message.username)) &&
    (message.playerName === undefined || isString(message.playerName))
  );
}

export function isAnswerResultMessage(message: SocketMessage): message is AnswerResultMsg {
  return (
    message.type === "answer-result" &&
    isString(message.gameId) &&
    isString(message.answerSessionId) &&
    isString(message.transcript) &&
    (message.verdict === "correct" || message.verdict === "incorrect") &&
    isFiniteNumber(message.suggestedDelta) &&
    (message.username === undefined || isString(message.username)) &&
    (message.displayname === undefined || isString(message.displayname)) &&
    (message.confidence === undefined || isFiniteNumber(message.confidence))
  );
}

export function isAnswerErrorMessage(message: SocketMessage): message is AnswerErrorMsg {
  return (
    message.type === "answer-error" &&
    isString(message.gameId) &&
    isString(message.message) &&
    (message.answerSessionId === undefined || isString(message.answerSessionId))
  );
}

export function isDailyDoubleShowModalMessage(
  message: SocketMessage,
): message is DailyDoubleShowModalMsg {
  return (
    message.type === "daily-double-show-modal" &&
    typeof message.showModal === "boolean" &&
    isFiniteNumber(message.maxWager) &&
    (message.username === undefined || isString(message.username)) &&
    (message.displayname === undefined || isString(message.displayname))
  );
}

export function isDailyDoubleWagerParseFailedMessage(
  message: SocketMessage,
): message is DailyDoubleWagerParseFailedMessage {
  return (
    message.type === "daily-double-wager-parse-failed" &&
    (message.reason === undefined || isString(message.reason))
  );
}

export function isDailyDoubleWagerCaptureStartMessage(
  message: SocketMessage,
): message is DailyDoubleWagerCaptureStartMsg {
  return (
    message.type === "daily-double-wager-capture-start" &&
    isString(message.gameId) &&
    isString(message.ddWagerSessionId) &&
    isFiniteNumber(message.durationMs) &&
    isFiniteNumber(message.deadlineAt) &&
    (message.username === undefined || isString(message.username)) &&
    (message.displayname === undefined || isString(message.displayname))
  );
}

export function isDailyDoubleWagerHeardMessage(
  message: SocketMessage,
): message is DailyDoubleWagerHeardMsg {
  return (
    message.type === "daily-double-wager-heard" &&
    isString(message.gameId) &&
    isString(message.transcript) &&
    isFiniteNumber(message.maxWager) &&
    (message.parsedWager === null ||
      message.parsedWager === undefined ||
      isFiniteNumber(message.parsedWager)) &&
    (message.reason === null || message.reason === undefined || isString(message.reason)) &&
    (message.username === undefined || isString(message.username)) &&
    (message.displayname === undefined || isString(message.displayname))
  );
}

export function isDailyDoubleWagerLockedMessage(
  message: SocketMessage,
): message is DailyDoubleWagerLockedMsg {
  return (
    message.type === "daily-double-wager-locked" &&
    isString(message.gameId) &&
    isFiniteNumber(message.wager) &&
    (message.username === undefined || isString(message.username)) &&
    (message.displayname === undefined || isString(message.displayname))
  );
}

export function isDailyDoubleErrorMessage(
  message: SocketMessage,
): message is DailyDoubleErrorMessage {
  return (
    message.type === "daily-double-error" &&
    (message.message === undefined || isString(message.message))
  );
}

export function isBuzzDeniedMessage(message: SocketMessage): message is BuzzDeniedMessage {
  return (
    message.type === "buzz-denied" &&
    isFiniteNumber(message.lockoutUntil) &&
    (message.reason === undefined || isString(message.reason))
  );
}

export function isFinalJeopardyMessage(message: SocketMessage): message is FinalJeopardyMessage {
  return (
    message.type === "final-jeopardy" &&
    (message.finalists === undefined || isStringArray(message.finalists))
  );
}

export function isClearedCluesSyncMessage(
  message: SocketMessage,
): message is ClearedCluesSyncMessage {
  return message.type === "cleared-clues-sync" && isStringArray(message.clearedClues);
}

export function isPhaseChangedMessage(message: SocketMessage): message is PhaseChangedMessage {
  return (
    message.type === "phase-changed" &&
    (message.phase === undefined || isNullableString(message.phase)) &&
    (message.selectorKey === undefined || isNullableString(message.selectorKey)) &&
    (message.selectorName === undefined || isNullableString(message.selectorName))
  );
}

export function isAllWagersSubmittedMessage(
  message: SocketMessage,
): message is AllWagersSubmittedMessage {
  return (
    message.type === "all-wagers-submitted" &&
    isRecordOfNumbers(message.wagers) &&
    isStringArray(message.finalists) &&
    (message.wagerDrawings === undefined || isRecordOfStrings(message.wagerDrawings))
  );
}

export function isPlayerListUpdateGameMessage(message: SocketMessage) {
  return isPlayerListUpdateMessage(message);
}

export function isBuzzResultMessage(message: SocketMessage): message is BuzzResultMessage {
  return (
    message.type === "buzz-result" &&
    isString(message.username) &&
    isString(message.displayname)
  );
}

export function isClueSelectedMessage(message: SocketMessage): message is ClueSelectedMessage {
  return (
    message.type === "clue-selected" &&
    isSelectedClueFromServer(message.clue) &&
    (message.clearedClues === undefined || isStringArray(message.clearedClues))
  );
}

export function isTimerStartMessage(message: SocketMessage): message is TimerStartMessage {
  return (
    message.type === "timer-start" &&
    isFiniteNumber(message.endTime) &&
    isFiniteNumber(message.duration) &&
    isFiniteNumber(message.timerVersion)
  );
}

export function isTimerEndMessage(message: SocketMessage): message is TimerEndMessage {
  return message.type === "timer-end" && isFiniteNumber(message.timerVersion);
}

export function isAnswerRevealedMessage(
  message: SocketMessage,
): message is AnswerRevealedMessage {
  return (
    message.type === "answer-revealed" &&
    (message.clue === undefined || isSelectedClueFromServer(message.clue))
  );
}

export function isAllCluesClearedMessage(
  message: SocketMessage,
): message is AllCluesClearedMessage {
  return (
    message.type === "all-clues-cleared" &&
    (message.clearedClues === undefined || isStringArray(message.clearedClues))
  );
}

export function isClueClearedMessage(message: SocketMessage): message is ClueClearedMessage {
  return message.type === "clue-cleared" && isString(message.clueId);
}

export function isReturnedToBoardMessage(
  message: SocketMessage,
): message is ReturnedToBoardMessage {
  return (
    message.type === "returned-to-board" &&
    (message.boardSelectionLocked === undefined ||
      isBoolean(message.boardSelectionLocked) ||
      message.boardSelectionLocked === null)
  );
}

export function isDisplayFinalistMessage(
  message: SocketMessage,
): message is DisplayFinalistMessage {
  return message.type === "display-finalist" && isString(message.finalist);
}

export function isUpdateScoreMessage(message: SocketMessage): message is UpdateScoreMessage {
  return (
    message.type === "update-score" &&
    isString(message.username) &&
    isFiniteNumber(message.score)
  );
}

export function isUpdateScoresMessage(message: SocketMessage): message is UpdateScoresMessage {
  return message.type === "update-scores" && isRecordOfNumbers(message.scores);
}

export function isAllDrawingsSubmittedMessage(
  message: SocketMessage,
): message is AllDrawingsSubmittedMessage {
  return message.type === "all-drawings-submitted" && isRecordOfStrings(message.drawings);
}

export function isFinalScoreScreenMessage(
  message: SocketMessage,
): message is FinalScoreScreenMessage {
  return (
    message.type === "final-score-screen" &&
    (message.finalPlacements === undefined || isStringArray(message.finalPlacements))
  );
}
