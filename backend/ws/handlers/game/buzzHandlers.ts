import type { GameState, PlayerState } from "../../../types/runtime.js";
import type { WsHandler } from "../types.js";

type BuzzData = { gameId: string; estimatedServerBuzzAtMs?: number; clientSeq?: number };

export const buzzHandlers: Record<string, WsHandler> = {
  buzz: async ({ ws, data, ctx }) => {
    const { gameId } = data as BuzzData;
    const game = ctx.games?.[gameId] as GameState | undefined;
    if (!game) return;

    const player = game.players.find((p: PlayerState) => p.id === ws.id);
    if (!player?.username) return;

    const stable = ctx.playerStableId(player);
    if (!stable) return;

    const lockedOut = game.clueState?.lockedOut || {};
    if (game.clueState?.clueKey && lockedOut[stable]) {
      ws.send(JSON.stringify({ type: "buzz-denied", reason: "already-attempted", lockoutUntil: 0 }));
      return;
    }

    ctx.fireAndForget(ctx.repos.profiles.incrementTotalBuzzes(stable), "Increment total buzzes");

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
        const g = ctx.games?.[gameId];
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
        ctx.fireAndForget(ctx.repos.profiles.incrementTimesBuzzed(winner.playerUsername), "Increment buzzes won");

        ctx.broadcast(gameId, {
          type: "buzz-result",
          username: winner.playerUsername,
          displayname: winner.playerDisplayname,
        });

        g.buzzerLocked = true;
        ctx.broadcast(gameId, { type: "buzzer-locked" });

        await ctx.aiHostSayByKey(ctx, gameId, g, winner.playerDisplayname);

        setTimeout(() => {
          const gg = ctx.games?.[gameId];
          if (!gg) return;

          const ANSWER_SECONDS = typeof gg.timeToAnswer === "number" && gg.timeToAnswer > 0 ? gg.timeToAnswer : 9;
          const RECORD_MS = ANSWER_SECONDS * 1000;

          if (gg.buzzed !== winner.playerUsername) return;

          const boardKey = gg.activeBoard || "firstBoard";
          const v = String(gg.selectedClue?.value ?? "");
          const q = String(gg.selectedClue?.question ?? "").trim();
          const clueKey = `${boardKey}:${v}:${q}`;

          gg.phase = "ANSWER_CAPTURE";
          gg.answeringPlayerUsername = winner.playerUsername;
          gg.answerClueKey = clueKey;
          gg.answerSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
          gg.answerTranscript = null;
          gg.answerVerdict = null;
          gg.answerConfidence = null;

          ctx.clearAnswerWindow(gg);
          const deadlineAt = Date.now() + RECORD_MS;

          ctx.broadcast(gameId, {
            type: "answer-capture-start",
            gameId,
            username: winner.playerUsername,
            displayname: winner.playerDisplayname ?? null,
            answerSessionId: gg.answerSessionId,
            clueKey,
            durationMs: RECORD_MS,
            deadlineAt,
          });

          if (ANSWER_SECONDS > 0) {
            ctx.startGameTimer(gameId, gg, ctx, ANSWER_SECONDS, "answer");
          }

          ctx.startAnswerWindow(gameId, gg, ctx.broadcast, RECORD_MS, () => {
            const ggg = ctx.games?.[gameId];
            if (!ggg) return;
            if (!ggg.answerSessionId) return;
            if (ggg.answerSessionId !== gg.answerSessionId) return;
            if (ggg.answeringPlayerUsername !== winner.playerUsername) return;
            if (!ggg.selectedClue) return;

            ggg.phase = "RESULT";
            ggg.answerTranscript = "";
            ggg.answerVerdict = "incorrect";
            ggg.answerConfidence = 0.0;

            const clueValue = ctx.parseClueValue(ggg.selectedClue?.value);
            ctx.broadcast(gameId, {
              type: "answer-result",
              gameId,
              answerSessionId: ggg.answerSessionId,
              username: winner.playerUsername,
              displayname: winner.playerDisplayname ?? null,
              transcript: "",
              verdict: "incorrect",
              confidence: 0.0,
              suggestedDelta: -clueValue,
            });

            ctx
              .autoResolveAfterJudgement(ctx, gameId, ggg, winner.playerUsername, "incorrect")
              .catch((e: unknown) => console.error("[answer-timeout] autoResolve failed:", e));
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
