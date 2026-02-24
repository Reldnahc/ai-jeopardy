import type { Clue } from "../../../../shared/types/board.ts";
import type { Player } from "../../../types/Lobby.ts";
import type { SelectedClueFromServer } from "./useGameSocketSync.types.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";
import { norm } from "./useGameSocketSync.router.shared.ts";

export function routeBoardMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (message.type === "buzz-denied") {
    const m = message as { lockoutUntil: number; reason?: string };
    d.applyLockoutUntil(Number(m.lockoutUntil || 0));
    if (m.reason === "already-attempted") d.setHasBuzzedCurrentClue(true);
    return true;
  }

  if (message.type === "final-jeopardy") {
    const m = message as { finalists?: string[] };
    d.setActiveBoard("finalJeopardy");
    d.setIsFinalJeopardy(true);
    d.setAllWagersSubmitted(false);
    d.setWagers({});
    d.setFinalPlacements([]);
    d.setFinalWagerDrawings({});
    d.setFinalists(Array.isArray(m.finalists) ? m.finalists : [""]);
    d.setSelectedClue(null);
    d.setBuzzResult(null);
    d.setBuzzResultDisplay(null);
    d.resetLocalTimerState();
    return true;
  }

  if (message.type === "cleared-clues-sync") {
    const m = message as { clearedClues: string[] };
    d.setClearedClues(new Set(m.clearedClues ?? []));
    return true;
  }

  if (message.type === "phase-changed") {
    const m = message as {
      phase?: string | null;
      selectorKey?: string | null;
      selectorName?: string | null;
    };
    d.setPhase(m.phase ?? null);
    d.setSelectorKey(m.selectorKey ?? null);
    d.setSelectorName(m.selectorName ?? null);
    return true;
  }

  if (message.type === "all-wagers-submitted") {
    const m = message as {
      wagers: Record<string, number>;
      finalists: string[];
      wagerDrawings?: Record<string, string>;
    };
    d.setAllWagersSubmitted(true);
    d.setWagers(m.wagers);
    d.setFinalWagers(m.wagers);
    d.setFinalWagerDrawings(m.wagerDrawings ?? {});
    d.setFinalists(m.finalists);
    return true;
  }

  if (message.type === "player-list-update") {
    const m = message as { players: Player[]; host: string };
    d.setPlayers(m.players);
    d.setHost(m.host);
    return true;
  }

  if (message.type === "buzz-result") {
    const m = message as { username: string; displayname: string };
    d.setBuzzResult(m.username);
    d.setBuzzResultDisplay(m.displayname);
    if (norm(m.username) === d.myUsername) d.setHasBuzzedCurrentClue(true);
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

  if (message.type === "clue-selected") {
    const m = message as { clue: SelectedClueFromServer; clearedClues?: string[] };
    const selected = { ...(m.clue as Clue), showAnswer: Boolean(m.clue.isAnswerRevealed) };
    d.setSelectedClue(selected);
    const clueKey = d.getClueKey(selected);
    if (clueKey !== d.currentClueKeyRef.current) {
      d.currentClueKeyRef.current = clueKey;
      d.setHasBuzzedCurrentClue(false);
    }
    if (m.clearedClues) d.setClearedClues(new Set(m.clearedClues));
    return true;
  }

  if (message.type === "timer-start") {
    const m = message as { endTime: number; duration: number; timerVersion: number };
    d.timerVersionRef.current = m.timerVersion;
    d.setTimerEndTime(m.endTime);
    d.setTimerDuration(m.duration);
    return true;
  }

  if (message.type === "timer-end") {
    const m = message as { timerVersion: number };
    if (m.timerVersion === d.timerVersionRef.current) d.resetLocalTimerState();
    return true;
  }

  if (message.type === "answer-revealed") {
    const m = message as { clue?: SelectedClueFromServer };
    if (m.clue) d.setSelectedClue({ ...(m.clue as Clue), showAnswer: true });
    d.resetLocalTimerState();
    return true;
  }

  if (message.type === "all-clues-cleared") {
    const m = message as { clearedClues?: string[] };
    if (Array.isArray(m.clearedClues)) d.setClearedClues(new Set(m.clearedClues));
    return true;
  }

  if (message.type === "clue-cleared") {
    const m = message as { clueId: string };
    d.setClearedClues((prev) => new Set(prev).add(m.clueId));
    return true;
  }

  if (message.type === "board-selection-unlocked") {
    d.setBoardSelectionLocked(false);
    return true;
  }

  if (message.type === "returned-to-board") {
    const m = message as { boardSelectionLocked?: boolean };
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
    d.setBoardSelectionLocked(m.boardSelectionLocked ?? null);
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

  if (message.type === "display-finalist") {
    const m = message as { finalist: string };
    d.setShowWager(false);
    d.setSelectedFinalist(m.finalist);
    return true;
  }

  if (message.type === "update-score") {
    const m = message as { username: string; score: number };
    d.setScores((prev) => ({ ...prev, [m.username]: m.score }));
    return true;
  }

  if (message.type === "update-scores") {
    const m = message as { scores: Record<string, number> };
    d.setScores(m.scores);
    return true;
  }

  if (message.type === "all-drawings-submitted") {
    const m = message as { drawings: Record<string, string> };
    d.setDrawings(m.drawings);
    return true;
  }

  if (message.type === "final-score-screen") {
    const m = message as { finalPlacements?: string[] };
    d.setFinalPlacements(Array.isArray(m.finalPlacements) ? m.finalPlacements : []);
    d.setIsGameOver(true);
    return true;
  }

  return false;
}
