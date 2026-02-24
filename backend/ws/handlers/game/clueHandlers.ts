import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";

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
>;

export const clueHandlers: Record<string, WsHandler> = {
  "clue-selected": async ({ ws, data, ctx }) => {
    const hctx = ctx as ClueHandlersCtx;
    const { gameId, clue } = (data ?? {}) as ClueSelectedData;
    const game = hctx.games?.[gameId];
    if (!game) return;
    const clueObj =
      clue && typeof clue === "object"
        ? (clue as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const norm = (v: unknown) =>
      String(v ?? "")
        .trim()
        .toLowerCase();

    const caller = hctx.getPlayerForSocket(game, ws);
    const callerStable = caller ? norm(hctx.playerStableId(caller)) : null;
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

    if (callerStable !== norm(game.selectorKey)) {
      console.warn("[CLUE SELECT BLOCKED] not selector");
      return;
    }

    hctx.cancelAutoUnlock(game);
    hctx.fireAndForget(hctx.repos.profiles.incrementCluesSelected(callerStable), "Increment Clues");

    const category =
      String(clueObj.category ?? "").trim() || hctx.findCategoryForClue(game, clueObj);

    game.selectedClue = {
      ...clueObj,
      category: category || undefined,
      isAnswerRevealed: false,
    };

    const boardKey = game.activeBoard || "firstBoard";
    const v = String(clueObj.value ?? "");
    const q = String(clueObj.question ?? "").trim();
    const clueKey = `${boardKey}:${v}:${q}`;

    const ddKeys = game.boardData?.dailyDoubleClueKeys?.[boardKey] || [];
    const naturalDD = ddKeys.includes(clueKey) && !game.usedDailyDoubles?.has?.(clueKey);
    const snipedDD = Boolean(game.ddSnipeNext);
    const isDailyDouble = naturalDD || snipedDD;

    if (snipedDD) {
      game.ddSnipeNext = false;
      hctx.broadcast(gameId, { type: "dd-snipe-consumed", clueKey });
    }

    game.phase = "clue";
    game.clueState = { clueKey, lockedOut: {} };
    game.buzzed = null;
    game.buzzerLocked = true;
    game.buzzLockouts = {};

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

      const playerUsername = norm(game.selectorKey);
      const playerDisplayname = String(game.selectorName ?? "").trim() || playerUsername;

      hctx.fireAndForget(
        hctx.repos.profiles.incrementDailyDoubleFound(playerUsername),
        "Increment Daily Double found",
      );

      const maxWager = hctx.computeDailyDoubleMaxWager(game, boardKey, playerUsername);

      game.dailyDouble = {
        clueKey,
        boardKey,
        playerUsername,
        playerDisplayname,
        stage: "wager_listen",
        wager: null,
        maxWager,
        attempts: 0,
      };

      const showModal = () => {
        hctx.broadcast(gameId, {
          type: "daily-double-show-modal",
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
      { slot: String(game.selectedClue.category ?? ""), pad },
      { slot: String(game.selectedClue.value ?? ""), after: broadcastClueSelected },
      { assetId: ttsAssetId },
    ]);

    hctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
  },
};
