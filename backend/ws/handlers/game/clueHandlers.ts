import type { WsHandler } from "../types.js";

type ClueSelectedData = { gameId: string; clue?: Record<string, unknown> };

export const clueHandlers: Record<string, WsHandler> = {
  "clue-selected": async ({ ws, data, ctx }) => {
    const { gameId, clue } = (data ?? {}) as ClueSelectedData;
    const game = ctx.games?.[gameId];
    if (!game) return;
    const clueObj =
      clue && typeof clue === "object"
        ? (clue as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const norm = (v: unknown) =>
      String(v ?? "")
        .trim()
        .toLowerCase();

    const caller = ctx.getPlayerForSocket(game, ws);
    const callerStable = caller ? norm(ctx.playerStableId(caller)) : null;
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

    ctx.cancelAutoUnlock(game);
    ctx.fireAndForget(ctx.repos.profiles.incrementCluesSelected(callerStable), "Increment Clues");

    const category =
      String(clueObj.category ?? "").trim() || ctx.findCategoryForClue(game, clueObj);

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
      ctx.broadcast(gameId, { type: "dd-snipe-consumed", clueKey });
    }

    game.phase = "clue";
    game.clueState = { clueKey, lockedOut: {} };
    game.buzzed = null;
    game.buzzerLocked = true;
    game.buzzLockouts = {};

    const pad = 25;
    const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

    const broadcastClueSelected = () => {
      ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
      ctx.broadcast(gameId, { type: "buzzer-locked" });
      ctx.broadcast(gameId, {
        type: "clue-selected",
        clue: game.selectedClue,
        clearedClues: Array.from(game.clearedClues),
      });
    };

    if (isDailyDouble) {
      if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();

      const playerUsername = norm(game.selectorKey);
      const playerDisplayname = String(game.selectorName ?? "").trim() || playerUsername;

      ctx.fireAndForget(
        ctx.repos.profiles.incrementDailyDoubleFound(playerUsername),
        "Increment Daily Double found",
      );

      const maxWager = ctx.computeDailyDoubleMaxWager(game, boardKey, playerUsername);

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
        ctx.broadcast(gameId, {
          type: "daily-double-show-modal",
          username: playerUsername,
          displayname: playerDisplayname,
          maxWager,
        });
      };

      await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        { slot: "daily_double", after: showModal },
        { slot: playerDisplayname },
        { slot: "daily_double2" },
        { slot: "single_wager" },
      ]);

      ctx.startDdWagerCapture(gameId, game, ctx);
      return;
    }

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: String(game.selectedClue.category ?? ""), pad },
      { slot: String(game.selectedClue.value ?? ""), after: broadcastClueSelected },
      { assetId: ttsAssetId },
    ]);

    ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
  },
};
