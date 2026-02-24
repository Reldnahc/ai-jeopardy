import type { GameState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";

type GameIdData = { gameId: string };
type UpdateScoreData = { gameId: string; username: string; delta: number };
type DdSnipeNextData = { gameId: string; enabled?: boolean };
type SubmitWagerData = { gameId: string; player: string; wager: number };
type SubmitDrawingData = { gameId: string; player: string; drawing: string };
type SubmitFinalWagerDrawingData = { gameId: string; player: string; drawing: string };
type TtsEnsureData = {
  gameId: string;
  text?: string;
  textType?: string;
  voiceId?: string;
  requestId?: string;
};

type MiscHandlersCtx = CtxDeps<
  | "games"
  | "broadcast"
  | "requireHost"
  | "cancelAutoUnlock"
  | "doUnlockBuzzerAuthoritative"
  | "checkBoardTransition"
  | "clearAnswerWindow"
  | "submitWager"
  | "submitDrawing"
  | "submitWagerDrawing"
  | "ensureTtsAsset"
  | "repos"
  | "checkAllWagersSubmitted"
  | "checkAllDrawingsSubmitted"
>;

export const miscHandlers: Record<string, WsHandler> = {
  "dd-snipe-next": async ({ data, ctx }) => {
    const hctx = ctx as MiscHandlersCtx;
    const { gameId, enabled } = (data || {}) as DdSnipeNextData;
    const game = hctx.games?.[gameId] as GameState | undefined;
    if (!game) return;

    game.ddSnipeNext = Boolean(enabled);
    hctx.broadcast(gameId, { type: "dd-snipe-next-set", enabled: Boolean(game.ddSnipeNext) });
  },

  "unlock-buzzer": async ({ ws, data, ctx }) => {
    const { gameId } = data as GameIdData;
    const game = ctx.games[gameId];
    if (!game) return;
    if (!ctx.requireHost(game, ws)) return;

    ctx.cancelAutoUnlock(game);
    ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
  },

  "lock-buzzer": async ({ ws, data, ctx }) => {
    const { gameId } = data as GameIdData;
    if (!ctx.requireHost(ctx.games[gameId], ws)) return;

    if (ctx.games[gameId]) {
      ctx.games[gameId].buzzerLocked = true;
      ctx.broadcast(gameId, { type: "buzzer-locked" });
    }
  },

  "reset-buzzer": async ({ ws, data, ctx }) => {
    const { gameId } = data as GameIdData;
    const game = ctx.games[gameId];
    if (!game) return;
    if (!ctx.requireHost(game, ws)) return;

    game.buzzed = null;
    game.buzzerLocked = true;
    ctx.games[gameId].buzzLockouts = {};
    game.timerEndTime = null;
    game.timerVersion = (game.timerVersion || 0) + 1;

    ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
    ctx.broadcast(gameId, { type: "buzzer-locked" });
    ctx.broadcast(gameId, {
      type: "timer-end",
      timerVersion: ctx.games[gameId]?.timerVersion || 0,
    });
  },

  "mark-all-complete": async ({ data, ctx }) => {
    const { gameId } = data as GameIdData;
    const game = ctx.games[gameId];
    if (!game) return;

    if (!game.clearedClues) game.clearedClues = new Set();
    const boardKey = game.activeBoard || "firstBoard";
    const board = game.boardData?.[boardKey] as
      | { categories?: Array<{ values?: Array<{ value?: unknown; question?: unknown }> }> }
      | undefined;
    if (!board?.categories) return;

    for (const cat of board.categories) {
      for (const clue of cat.values || []) {
        const clueId = `${clue.value}-${clue.question}`;
        game.clearedClues.add(clueId);
      }
    }

    ctx.broadcast(gameId, {
      type: "cleared-clues-sync",
      clearedClues: Array.from(game.clearedClues),
    });

    ctx.checkBoardTransition(game, gameId, ctx);
  },

  "reveal-answer": async ({ ws, data, ctx }) => {
    const { gameId } = data as GameIdData;
    const game = ctx.games[gameId];
    if (!game) return;
    if (!ctx.requireHost(game, ws)) return;

    ctx.clearAnswerWindow(game);
    game.phase = null;
    game.answeringPlayerKey = null;
    game.answerSessionId = null;
    game.answerClueKey = null;

    if (game.selectedClue) {
      game.selectedClue.isAnswerRevealed = true;
      ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
    }
  },

  "update-score": async ({ data, ctx }) => {
    const { gameId, username, delta } = data as UpdateScoreData;
    const game = ctx.games[gameId];
    if (!game) return;

    if (!game.scores) game.scores = {};
    game.scores[username] = (game.scores[username] || 0) + Number(delta || 0);
    ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
  },

  "submit-wager": async ({ data, ctx }) => {
    const { gameId, player, wager } = data as SubmitWagerData;
    const game = ctx.games[gameId];
    if (game) ctx.submitWager(game, gameId, player, wager, ctx);
  },

  "submit-drawing": async ({ data, ctx }) => {
    const { gameId, player, drawing } = data as SubmitDrawingData;
    const game = ctx.games[gameId];
    if (game) await ctx.submitDrawing(game, gameId, player, drawing, ctx);
  },

  "submit-final-wager-drawing": async ({ data, ctx }) => {
    const { gameId, player, drawing } = data as SubmitFinalWagerDrawingData;
    const game = ctx.games[gameId];
    if (game) await ctx.submitWagerDrawing(game, gameId, player, drawing, ctx);
  },

  "tts-ensure": async ({ ws, data, ctx }) => {
    const { gameId, text, textType, voiceId, requestId } = (data ?? {}) as TtsEnsureData;
    const safeText = typeof text === "string" ? text : "";
    if (!gameId || !safeText.trim()) return;

    const game = ctx.games?.[gameId];
    if (!game) return;
    if (!game.lobbySettings?.narrationEnabled) {
      ws.send(JSON.stringify({ type: "tts-error", requestId, message: "Narration disabled" }));
      return;
    }

    try {
      const asset = await ctx.ensureTtsAsset(
        {
          text: safeText,
          textType: (textType || "text") as "text" | "ssml",
          voiceId: voiceId || "amy",
          engine: "standard",
          outputFormat: "mp3",
          provider: "piper",
        },
        ctx.repos,
      );

      ws.send(
        JSON.stringify({
          type: "tts-ready",
          requestId,
          assetId: asset.id,
          url: `/api/tts/${asset.id}`,
        }),
      );
    } catch (e) {
      console.error("tts-ensure failed:", e);
      ws.send(JSON.stringify({ type: "tts-error", requestId, message: "Failed to generate narration" }));
    }
  },
};
