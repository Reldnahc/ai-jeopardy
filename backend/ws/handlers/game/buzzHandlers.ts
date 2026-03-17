import type { GameState, PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { shouldIncrementStats } from "../../../game/statsGate.js";
import { startAnswerCapture } from "../../../game/gameLogic/answerCapture.js";
import {
  addPendingBuzzCandidate,
  BUZZ_COLLECTION_MS,
  createPendingBuzzState,
  getEarlyBuzzLockoutUntil,
  getEstimatedBuzzAt,
  isEstimatedBuzzAtValid,
  resolvePendingBuzzWinner,
} from "../../../game/gameLogic/buzzCollection.js";

type BuzzData = { gameId: string; estimatedServerBuzzAtMs?: number; clientSeq?: number };

type BuzzHandlersCtx = CtxDeps<
  | "games"
  | "playerStableId"
  | "fireAndForget"
  | "repos"
  | "broadcast"
  | "aiHostSayByKey"
  | "clearAnswerWindow"
  | "startGameTimer"
  | "startAnswerWindow"
  | "autoResolveAfterJudgement"
>;

export const buzzHandlers: Record<string, WsHandler> = {
  buzz: async ({ ws, data, ctx }) => {
    const hctx = ctx as BuzzHandlersCtx;
    const { gameId } = data as BuzzData;
    const game = hctx.games?.[gameId] as GameState | undefined;
    if (!game) return;

    const player = game.players.find((p: PlayerState) => p.id === ws.id);
    if (!player?.username) return;

    const stable = hctx.playerStableId(player);
    if (!stable) return;

    const lockedOut = game.clueState?.lockedOut || {};
    if (game.clueState?.clueKey && lockedOut[stable]) {
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "already-attempted", lockoutUntil: 0 }));
      return;
    }

    const allowStats = shouldIncrementStats(game);
    if (allowStats) {
      hctx.fireAndForget(hctx.repos.profiles.incrementTotalBuzzes(stable), "Increment total buzzes");
    }

    if (!game.buzzLockouts) game.buzzLockouts = {};

    const now = Date.now();
    const lockoutUntil = game.buzzLockouts[stable] || 0;
    if (!game._buzzMsgSeq) game._buzzMsgSeq = 0;
    const msgSeq = ++game._buzzMsgSeq;

    if (game.buzzed) {
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "already-buzzed", lockoutUntil }));
      return;
    }

    if (lockoutUntil > now) {
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "locked-out", lockoutUntil }));
      return;
    }

    if (game.buzzerLocked) {
      const until = getEarlyBuzzLockoutUntil(now);
      game.buzzLockouts[stable] = until;
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "early", lockoutUntil: until }));
      return;
    }

    const { estimatedAt, usedClientEstimate } = getEstimatedBuzzAt(
      (data as BuzzData)?.estimatedServerBuzzAtMs,
      now,
    );
    if (!isEstimatedBuzzAtValid(game, estimatedAt, now, usedClientEstimate)) {
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
      return;
    }

    if (!game.pendingBuzz) {
      game.pendingBuzz = createPendingBuzzState(now);

      game.pendingBuzz.timer = setTimeout(async () => {
        const g = hctx.games?.[gameId];
        if (!g || !g.pendingBuzz) return;

        if (g.buzzed || g.buzzerLocked) {
          try {
            if (g.pendingBuzz.timer) clearTimeout(g.pendingBuzz.timer);
          } catch {
            console.error("error clearing buzz timeout.");
          }
          g.pendingBuzz = null;
          return;
        }

        const candidates = g.pendingBuzz.candidates || [];
        g.pendingBuzz = null;
        if (candidates.length === 0) return;

        const winner = resolvePendingBuzzWinner(candidates);
        if (!winner?.playerUsername) return;

        g.buzzed = winner.playerUsername;
        if (allowStats) {
          hctx.fireAndForget(
            hctx.repos.profiles.incrementTimesBuzzed(winner.playerUsername),
            "Increment buzzes won",
          );
        }

        hctx.broadcast(gameId, {
          type: "buzz-result",
          username: winner.playerUsername,
          displayname: winner.playerDisplayname,
        });

        g.buzzerLocked = true;
        hctx.broadcast(gameId, { type: "buzzer-locked" });

        await hctx.aiHostSayByKey(ctx, gameId, g, winner.playerDisplayname);

        setTimeout(() => {
          const gg = hctx.games?.[gameId];
          if (!gg) return;

          if (gg.buzzed !== winner.playerUsername) return;

          const boardKey = gg.activeBoard || "firstBoard";
          const v = String(gg.selectedClue?.value ?? "");
          const q = String(gg.selectedClue?.question ?? "").trim();
          const clueKey = `${boardKey}:${v}:${q}`;

          startAnswerCapture({
            ctx: hctx,
            gameId,
            game: gg,
            playerUsername: winner.playerUsername,
            playerDisplayname: winner.playerDisplayname ?? null,
            clueKey,
            onAutoResolveError: (error: unknown) =>
              console.error("[answer-timeout] autoResolve failed:", error),
          });
        }, 0);
      }, BUZZ_COLLECTION_MS);
    }

    const clientSeq = Number((data as BuzzData)?.clientSeq || 0);
    addPendingBuzzCandidate(game, {
      playerUsername: stable,
      playerDisplayname: String(player.displayname ?? "").trim() || stable,
      est: estimatedAt,
      arrival: now,
      clientSeq,
      msgSeq,
    });
  },
};
