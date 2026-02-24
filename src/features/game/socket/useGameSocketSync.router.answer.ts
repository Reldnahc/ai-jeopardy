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
} from "./useGameSocketSync.types.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";

export function routeAnswerMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (message.type === "answer-processing") {
    d.setAnswerProcessing(message as AnswerProcessingMsg);
    return true;
  }

  if (message.type === "answer-capture-start") {
    const m = message as AnswerCaptureStartMsg;
    d.setAnswerCapture(m);
    d.setAnswerTranscript(null);
    d.setAnswerResult(null);
    d.setAnswerError(null);
    return true;
  }

  if (message.type === "answer-transcript") {
    d.setAnswerProcessing(null);
    d.setAnswerTranscript(message as AnswerTranscriptMsg);
    return true;
  }

  if (message.type === "answer-result") {
    d.setAnswerProcessing(null);
    d.setAnswerResult(message as AnswerResultMsg);
    return true;
  }

  if (message.type === "answer-error") {
    const m = message as AnswerErrorMsg;
    d.setAnswerProcessing(null);
    d.setAnswerError(String(m.message || "Answer error"));
    return true;
  }

  if (message.type === "daily-double-show-modal") {
    d.setShowDdModal(message as DailyDoubleShowModalMsg);
    return true;
  }

  if (message.type === "daily-double-hide-modal") {
    d.setShowDdModal(null);
    return true;
  }

  if (message.type === "daily-double-wager-parse-failed") {
    const m = message as { reason?: string };
    d.setDdWagerError(`Didn't catch that (${m.reason ?? "unknown"}). Try again.`);
    return true;
  }

  if (message.type === "daily-double-wager-capture-start") {
    const m = message as DailyDoubleWagerCaptureStartMsg;
    d.setDdWagerCapture(m);
    d.setDdWagerHeard(null);
    d.setDdWagerLocked(null);
    d.setDdWagerError(null);
    return true;
  }

  if (message.type === "daily-double-wager-heard") {
    d.setDdWagerHeard(message as DailyDoubleWagerHeardMsg);
    return true;
  }

  if (message.type === "daily-double-wager-locked") {
    d.setDdWagerLocked(message as DailyDoubleWagerLockedMsg);
    d.setDdWagerCapture(null);
    return true;
  }

  if (message.type === "daily-double-error") {
    const m = message as { message?: string };
    d.setDdWagerError(String(m.message || "Daily Double error"));
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
