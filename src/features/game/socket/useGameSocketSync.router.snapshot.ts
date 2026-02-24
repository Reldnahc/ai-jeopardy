import type { Clue } from "../../../../shared/types/board.ts";
import type { GameStateMessage } from "./useGameSocketSync.types.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";
import { norm } from "./useGameSocketSync.router.shared.ts";

export function routeSnapshotMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (message.type !== "game-state") return false;

  const m = message as GameStateMessage;

  if (typeof m.playerBuzzLockoutUntil === "number") {
    d.applyLockoutUntil(m.playerBuzzLockoutUntil);
  }

  d.setPlayers(m.players);
  d.setHost(m.host);
  d.setBuzzResult(m.buzzResult ?? null);
  d.setBuzzResultDisplay(m.buzzResultDisplay ?? null);
  d.setBoardData(m.boardData);
  d.setScores(m.scores ?? {});
  d.setBuzzerLocked(Boolean(m.buzzerLocked));
  d.setNarrationEnabled(Boolean(m.lobbySettings?.narrationEnabled));
  d.setPhase(m.phase ?? null);
  d.setSelectorKey(m.selectorKey ?? null);
  d.setSelectorName(m.selectorName ?? null);
  d.setBoardSelectionLocked(m.boardSelectionLocked ?? null);

  if (Array.isArray(m.clearedClues)) d.setClearedClues(new Set(m.clearedClues));
  if (m.activeBoard) d.setActiveBoard(m.activeBoard);

  const fj = m.activeBoard === "finalJeopardy" || m.isFinalJeopardy;
  d.setIsFinalJeopardy(Boolean(fj));

  if (fj) {
    const snapWagers = m.wagers ?? {};
    d.setWagers(snapWagers);

    const stage = m.finalJeopardyStage ?? null;
    d.setIsGameOver(stage === "finale");
    const submitted = stage !== "wager" && stage != null;
    d.setAllWagersSubmitted(submitted);

    d.setFinalists(Array.isArray(m.finalists) ? m.finalists : [""]);
    if (submitted) d.setFinalWagers(snapWagers);
    d.setDrawings(m.drawings ?? null);
  } else {
    d.setIsGameOver(false);
    d.setAllWagersSubmitted(false);
    d.setWagers({});
    d.setFinalWagers({});
    d.setFinalists([""]);
    d.setDrawings(null);
  }

  if (m.phase === "DD_WAGER_CAPTURE" && m.dailyDouble) {
    if (m.ddShowModal) {
      d.setShowDdModal({
        type: "daily-double-show-modal",
        showModal: true,
        username: m.ddShowModal.username,
        displayname: m.ddShowModal.displayname,
        maxWager: m.ddShowModal.maxWager,
      });
    }

    if (m.ddWagerSessionId && typeof m.ddWagerDeadlineAt === "number") {
      const durationMs = Math.max(0, m.ddWagerDeadlineAt - d.nowMs());
      d.setDdWagerCapture({
        type: "daily-double-wager-capture-start",
        gameId: d.gameId ?? "",
        ddWagerSessionId: m.ddWagerSessionId,
        durationMs,
        deadlineAt: m.ddWagerDeadlineAt,
      });
      d.setDdWagerHeard(null);
      d.setDdWagerLocked(null);
      d.setDdWagerError(null);
    }
  } else {
    d.setShowDdModal(null);
    d.clearDdWagerUi();
  }

  const selectedFromState =
    m.selectedClue && m.phase !== "DD_WAGER_CAPTURE"
      ? ({
          ...(m.selectedClue as Clue),
          showAnswer: Boolean(m.selectedClue.isAnswerRevealed),
        } as Clue)
      : null;

  d.setSelectedClue(selectedFromState);

  const clueKey = d.getClueKey(selectedFromState);
  if (clueKey !== d.currentClueKeyRef.current) {
    d.currentClueKeyRef.current = clueKey;
    d.setHasBuzzedCurrentClue(false);
  }

  if (m.buzzResult && norm(m.buzzResult) === d.myUsername) {
    d.setHasBuzzedCurrentClue(true);
  }

  if (typeof m.timerVersion === "number") d.timerVersionRef.current = m.timerVersion;

  if (typeof m.timerEndTime === "number" && m.timerEndTime > d.nowMs()) {
    d.setTimerEndTime(m.timerEndTime);
    d.setTimerDuration(typeof m.timerDuration === "number" ? m.timerDuration : 0);
  } else {
    d.resetLocalTimerState();
  }

  if (m.aiHostPlayback?.assetId) {
    const playback = m.aiHostPlayback;
    const offsetFromElapsed =
      typeof playback.elapsedMs === "number" && Number.isFinite(playback.elapsedMs)
        ? playback.elapsedMs
        : d.nowMs() - playback.startedAtMs;
    const offsetMs = Math.max(0, Math.round(offsetFromElapsed));
    const dedupeKey = `${playback.assetId}:${playback.startedAtMs}`;
    const durationMs =
      typeof playback.durationMs === "number" && Number.isFinite(playback.durationMs)
        ? Math.max(0, playback.durationMs)
        : null;

    if (
      d.aiHostPlaybackHydrationRef.current !== dedupeKey &&
      (durationMs == null || offsetMs < durationMs + 250)
    ) {
      d.aiHostPlaybackHydrationRef.current = dedupeKey;
      d.aiHostSeqRef.current += 1;
      d.setAiHostAsset(
        d.makeAiHostAssetPayload({
          seq: d.aiHostSeqRef.current,
          assetId: playback.assetId,
          startedAtMs: playback.startedAtMs,
          offsetMs,
        }),
      );
    }
  } else {
    d.aiHostPlaybackHydrationRef.current = null;
  }

  if (m.phase !== "DD_WAGER_CAPTURE") d.clearDdWagerUi();
  return true;
}
