import type { Clue } from "../../../../shared/types/board.ts";
import {
  isAllCluesClearedMessage,
  isAllDrawingsSubmittedMessage,
  isAllWagersSubmittedMessage,
  isAnswerRevealedMessage,
  isBuzzDeniedMessage,
  isBuzzResultMessage,
  isClearedCluesSyncMessage,
  isClueClearedMessage,
  isClueSelectedMessage,
  isDisplayFinalistMessage,
  isFinalJeopardyMessage,
  isFinalScoreScreenMessage,
  isPhaseChangedMessage,
  isPlayerListUpdateGameMessage,
  isReturnedToBoardMessage,
  isTimerEndMessage,
  isTimerStartMessage,
  isUpdateScoreMessage,
  isUpdateScoresMessage,
} from "./useGameSocketSync.guards.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";
import { norm } from "./useGameSocketSync.router.shared.ts";

export function routeBoardMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (isBuzzDeniedMessage(message)) {
    d.applyLockoutUntil(Number(message.lockoutUntil || 0));
    if (message.reason === "already-attempted") d.setHasBuzzedCurrentClue(true);
    return true;
  }

  if (isFinalJeopardyMessage(message)) {
    d.setActiveBoard("finalJeopardy");
    d.setIsFinalJeopardy(true);
    d.setAllWagersSubmitted(false);
    d.setWagers({});
    d.setFinalPlacements([]);
    d.setFinalWagerDrawings({});
    d.setFinalists(Array.isArray(message.finalists) ? message.finalists : [""]);
    d.setSelectedClue(null);
    d.setBuzzResult(null);
    d.setBuzzResultDisplay(null);
    d.resetLocalTimerState();
    return true;
  }

  if (isClearedCluesSyncMessage(message)) {
    d.setClearedClues(new Set(message.clearedClues ?? []));
    return true;
  }

  if (isPhaseChangedMessage(message)) {
    d.setPhase(message.phase ?? null);
    d.setSelectorKey(message.selectorKey ?? null);
    d.setSelectorName(message.selectorName ?? null);
    return true;
  }

  if (isAllWagersSubmittedMessage(message)) {
    d.setAllWagersSubmitted(true);
    d.setWagers(message.wagers);
    d.setFinalWagers(message.wagers);
    d.setFinalWagerDrawings(message.wagerDrawings ?? {});
    d.setFinalists(message.finalists);
    return true;
  }

  if (isPlayerListUpdateGameMessage(message)) {
    d.setPlayers(message.players);
    d.setHost(message.host);
    return true;
  }

  if (isBuzzResultMessage(message)) {
    d.setBuzzResult(message.username);
    d.setBuzzResultDisplay(message.displayname);
    if (norm(message.username) === d.myUsername) d.setHasBuzzedCurrentClue(true);
    d.resetLocalTimerState();
    return true;
  }

  if (message.type === "buzzer-locked") {
    d.setBuzzerLocked(true);
    return true;
  }

  if (message.type === "buzzer-unlocked") {
    d.setBuzzerLocked(false);
    return true;
  }

  if (isClueSelectedMessage(message)) {
    const selected: Clue = { ...message.clue, showAnswer: Boolean(message.clue.isAnswerRevealed) };
    d.setSelectedClue(selected);
    const clueKey = d.getClueKey(selected);
    if (clueKey !== d.currentClueKeyRef.current) {
      d.currentClueKeyRef.current = clueKey;
      d.setHasBuzzedCurrentClue(false);
    }
    if (message.clearedClues) d.setClearedClues(new Set(message.clearedClues));
    return true;
  }

  if (isTimerStartMessage(message)) {
    d.timerVersionRef.current = message.timerVersion;
    d.setTimerEndTime(message.endTime);
    d.setTimerDuration(message.duration);
    return true;
  }

  if (isTimerEndMessage(message)) {
    if (message.timerVersion === d.timerVersionRef.current) d.resetLocalTimerState();
    return true;
  }

  if (isAnswerRevealedMessage(message)) {
    if (message.clue) d.setSelectedClue({ ...message.clue, showAnswer: true });
    d.resetLocalTimerState();
    return true;
  }

  if (isAllCluesClearedMessage(message)) {
    if (Array.isArray(message.clearedClues)) d.setClearedClues(new Set(message.clearedClues));
    return true;
  }

  if (isClueClearedMessage(message)) {
    d.setClearedClues((prev) => new Set(prev).add(message.clueId));
    return true;
  }

  if (message.type === "board-selection-unlocked") {
    d.setBoardSelectionLocked(false);
    return true;
  }

  if (isReturnedToBoardMessage(message)) {
    d.setSelectedClue(null);
    d.currentClueKeyRef.current = null;
    d.setHasBuzzedCurrentClue(false);
    d.setBuzzResult(null);
    d.setBuzzResultDisplay(null);
    d.setAnswerCapture(null);
    d.setAnswerTranscript(null);
    d.setAnswerResult(null);
    d.setAnswerError(null);
    d.setAiHostText(null);
    d.clearDdWagerUi();
    d.setBoardSelectionLocked(message.boardSelectionLocked ?? null);
    d.resetLocalTimerState();
    return true;
  }

  if (message.type === "transition-to-second-board") {
    d.setActiveBoard("secondBoard");
    d.setIsFinalJeopardy(false);
    d.setAllWagersSubmitted(false);
    d.setWagers({});
    return true;
  }

  if (isDisplayFinalistMessage(message)) {
    d.setShowWager(false);
    d.setSelectedFinalist(message.finalist);
    return true;
  }

  if (isUpdateScoreMessage(message)) {
    d.setScores((prev) => ({ ...prev, [message.username]: message.score }));
    return true;
  }

  if (isUpdateScoresMessage(message)) {
    d.setScores(message.scores);
    return true;
  }

  if (isAllDrawingsSubmittedMessage(message)) {
    d.setDrawings(message.drawings);
    return true;
  }

  if (isFinalScoreScreenMessage(message)) {
    d.setFinalPlacements(Array.isArray(message.finalPlacements) ? message.finalPlacements : []);
    d.setIsGameOver(true);
    return true;
  }

  return false;
}
