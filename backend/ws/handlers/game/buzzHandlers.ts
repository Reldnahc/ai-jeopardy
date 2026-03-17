import type { GameState, PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { shouldIncrementStats } from "../../../game/statsGate.js";
import { startAnswerCapture } from "../../../game/gameLogic/answerCapture.js";

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
      const EARLY_BUZZ_LOCKOUT_MS = 1000;
      const until = now + EARLY_BUZZ_LOCKOUT_MS;
      game.buzzLockouts[stable] = until;
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "early", lockoutUntil: until }));
      return;
    }

    const estRaw = Number((data as BuzzData)?.estimatedServerBuzzAtMs);
    const looksLikeEpochMs = Number.isFinite(estRaw) && estRaw >= 1_000_000_000_000;
    const est = looksLikeEpochMs ? estRaw : now;

    if (looksLikeEpochMs) {
      const openAt = Number(game?.clueState?.buzzOpenAtMs || 0);
      const MAX_EARLY_MS = 50;
      const MAX_FUTURE_MS = 250;
      if (openAt > 0 && est < openAt - MAX_EARLY_MS) {
        ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
        return;
      }
      if (est > now + MAX_FUTURE_MS) {
        ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
        return;
      }
    }

    const COLLECT_MS = 50;
    const EPS_MS = 5;

    if (!game.pendingBuzz) {
      game.pendingBuzz = { deadline: now + COLLECT_MS, candidates: [], timer: null };

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

        candidates.sort(
          (a: { est: number; arrival: number; msgSeq?: number }, b: { est: number; arrival: number; msgSeq?: number }) => {
            const dt = a.est - b.est;
            if (Math.abs(dt) <= EPS_MS) {
              const da = a.arrival - b.arrival;
              if (da !== 0) return da;
              return (a.msgSeq || 0) - (b.msgSeq || 0);
            }
            return dt;
          },
        );

        const winner = candidates[0];
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
      }, COLLECT_MS);
    }

    const clientSeq = Number((data as BuzzData)?.clientSeq || 0);
    const already = game.pendingBuzz.candidates.find((c: { playerUsername: string }) => c.playerUsername === stable);
    if (!already) {
      game.pendingBuzz.candidates.push({
        playerUsername: stable,
        playerDisplayname: String(player.displayname ?? "").trim() || stable,
        est,
        arrival: now,
        clientSeq,
        msgSeq,
      });
    }
  },
};
