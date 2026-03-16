import {
  isAnswerCaptureStartMessage,
  isAnswerErrorMessage,
  isAnswerProcessingMessage,
  isAnswerResultMessage,
  isAnswerTranscriptMessage,
  isDailyDoubleErrorMessage,
  isDailyDoubleShowModalMessage,
  isDailyDoubleWagerCaptureStartMessage,
  isDailyDoubleWagerHeardMessage,
  isDailyDoubleWagerLockedMessage,
  isDailyDoubleWagerParseFailedMessage,
} from "./useGameSocketSync.guards.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";

export function routeAnswerMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (isAnswerProcessingMessage(message)) {
    d.setAnswerProcessing(message);
    return true;
  }

  if (isAnswerCaptureStartMessage(message)) {
    d.setAnswerCapture(message);
    d.setAnswerTranscript(null);
    d.setAnswerResult(null);
    d.setAnswerError(null);
    return true;
  }

  if (isAnswerTranscriptMessage(message)) {
    d.setAnswerProcessing(null);
    d.setAnswerTranscript(message);
    return true;
  }

  if (isAnswerResultMessage(message)) {
    d.setAnswerProcessing(null);
    d.setAnswerResult(message);
    return true;
  }

  if (isAnswerErrorMessage(message)) {
    d.setAnswerProcessing(null);
    d.setAnswerError(String(message.message || "Answer error"));
    return true;
  }

  if (isDailyDoubleShowModalMessage(message)) {
    d.setShowDdModal(message);
    return true;
  }

  if (message.type === "daily-double-hide-modal") {
    d.setShowDdModal(null);
    return true;
  }

  if (isDailyDoubleWagerParseFailedMessage(message)) {
    d.setDdWagerError(`Didn't catch that (${message.reason ?? "unknown"}). Try again.`);
    return true;
  }

  if (isDailyDoubleWagerCaptureStartMessage(message)) {
    d.setDdWagerCapture(message);
    d.setDdWagerHeard(null);
    d.setDdWagerLocked(null);
    d.setDdWagerError(null);
    return true;
  }

  if (isDailyDoubleWagerHeardMessage(message)) {
    d.setDdWagerHeard(message);
    return true;
  }

  if (isDailyDoubleWagerLockedMessage(message)) {
    d.setDdWagerLocked(message);
    d.setDdWagerCapture(null);
    return true;
  }

  if (isDailyDoubleErrorMessage(message)) {
    d.setDdWagerError(String(message.message || "Daily Double error"));
    return true;
  }

  if (message.type === "reveal-finalist-wager") {
    d.setShowWager(true);
    return true;
  }

  if (message.type === "buzzer-ui-reset") {
    d.clearAnswerUi();
    d.clearDdWagerUi();
    return true;
  }

  if (message.type === "reset-buzzer") {
    d.clearAnswerUi();
    d.resetLocalTimerState();
    return true;
  }

  return false;
}
