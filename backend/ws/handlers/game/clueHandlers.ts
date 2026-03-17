import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { shouldIncrementStats } from "../../../game/statsGate.js";
import {
  activateLiveClue,
  applySelectedClue,
  consumeDdSnipe,
  consumeSkippedClue,
  estimateClueSpeechMaxMs,
  normalizeGameValue,
  resolveSpecialClueModes,
  startDailyDoubleState,
} from "../../../game/gameLogic/clueSelection.js";

type ClueSelectedData = { gameId: string; clue?: Record<string, unknown> };
type ClueHandlersCtx = CtxDeps<
  | "games"
  | "getPlayerForSocket"
  | "playerStableId"
  | "cancelAutoUnlock"
  | "fireAndForget"
  | "repos"
  | "findCategoryForClue"
  | "broadcast"
  | "computeDailyDoubleMaxWager"
  | "aiHostVoiceSequence"
  | "startDdWagerCapture"
  | "doUnlockBuzzerAuthoritative"
  | "getTtsDurationMs"
  | "sleepAndCheckGame"
  | "checkBoardTransition"
>;

export const clueHandlers: Record<string, WsHandler> = {
  "clue-selected": async ({ ws, data, ctx }) => {
    const hctx = ctx as ClueHandlersCtx;
    const { gameId, clue } = (data ?? {}) as ClueSelectedData;
    const game = hctx.games?.[gameId];
    if (!game) return;
    const clueObj = clue && typeof clue === "object" ? (clue as Record<string, unknown>) : {};

    const caller = hctx.getPlayerForSocket(game, ws);
    const callerStable = caller ? normalizeGameValue(hctx.playerStableId(caller)) : null;
    const callerDisplay = String(caller?.displayname ?? "").trim() || (callerStable ?? null);

    console.log("[CLUE SELECT ATTEMPT]", {
      phase: game.phase,
      selectorKey: game.selectorKey,
      selectorName: game.selectorName,
      callerStable,
      callerDisplayname: callerDisplay,
    });

    if (game.phase !== "board") {
      console.warn("[CLUE SELECT BLOCKED] wrong phase");
      return;
    }

    if (game.boardSelectionLocked) {
      console.warn("[CLUE SELECT BLOCKED] board selection locked", {
        reason: game.boardSelectionLockReason,
        lockVersion: game.boardSelectionLockVersion,
      });
      return;
    }

    if (!callerStable) {
      console.warn("[CLUE SELECT BLOCKED] no callerStable");
      return;
    }

    if (callerStable !== normalizeGameValue(game.selectorKey)) {
      console.warn("[CLUE SELECT BLOCKED] not selector");
      return;
    }

    hctx.cancelAutoUnlock(game);
    if (shouldIncrementStats(game)) {
      hctx.fireAndForget(hctx.repos.profiles.incrementCluesSelected(callerStable), "Increment Clues");
    }

    const { boardKey, clueKey, clueQuestion } = applySelectedClue({
      game,
      clue: clueObj,
      findCategoryForClue: (currentGame, currentClue) =>
        hctx.findCategoryForClue(currentGame, currentClue),
    });
    const { snipedDailyDouble, isDailyDouble, shouldSkip } = resolveSpecialClueModes(
      game,
      boardKey,
      clueKey,
    );

    if (snipedDailyDouble) {
      consumeDdSnipe(game);
      hctx.broadcast(gameId, { type: "dd-snipe-consumed", clueKey });
    }

    if (shouldSkip) {
      const clueId = consumeSkippedClue(game, clueObj);

      hctx.broadcast(gameId, { type: "clue-cleared", clueId });
      hctx.broadcast(gameId, { type: "skip-next-clue-consumed", clueKey });
      hctx.checkBoardTransition(game, gameId, ctx);
      return;
    }

    activateLiveClue(game, clueKey);

    const pad = 25;
    const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

    const broadcastClueSelected = () => {
      hctx.broadcast(gameId, { type: "buzzer-ui-reset" });
      hctx.broadcast(gameId, { type: "buzzer-locked" });
      hctx.broadcast(gameId, {
        type: "clue-selected",
        clue: game.selectedClue,
        clearedClues: Array.from(game.clearedClues),
      });
    };

    if (isDailyDouble) {
      if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();

      const playerUsername = normalizeGameValue(game.selectorKey);
      const playerDisplayname = String(game.selectorName ?? "").trim() || playerUsername;

      if (shouldIncrementStats(game)) {
        hctx.fireAndForget(
          hctx.repos.profiles.incrementDailyDoubleFound(playerUsername),
          "Increment Daily Double found",
        );
      }

      const maxWager = hctx.computeDailyDoubleMaxWager(game, boardKey, playerUsername);

      startDailyDoubleState({
        game,
        clueKey,
        boardKey,
        playerUsername,
        playerDisplayname,
        maxWager,
      });

      const showModal = () => {
        hctx.broadcast(gameId, {
          type: "daily-double-show-modal",
          showModal: true,
          username: playerUsername,
          displayname: playerDisplayname,
          maxWager,
        });
      };

      await hctx.aiHostVoiceSequence(hctx, gameId, game, [
        { slot: "daily_double", after: showModal },
        { slot: playerDisplayname },
        { slot: "daily_double2" },
        { slot: "single_wager" },
      ]);

      hctx.startDdWagerCapture(gameId, game, ctx);
      return;
    }

    await hctx.aiHostVoiceSequence(hctx, gameId, game, [
      { slot: String(game.selectedClue.category ?? ""), pad, maxMs: 2_500 },
      { slot: String(game.selectedClue.value ?? ""), after: broadcastClueSelected, maxMs: 2_000 },
      { assetId: ttsAssetId, maxMs: estimateClueSpeechMaxMs(clueQuestion) },
    ]);

    hctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
  },
};
