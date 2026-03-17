import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { validateDailyDoubleSubmission } from "../../../game/dailyDouble/submission.js";

type DailyDoubleWagerAudioBlobData = {
  gameId: string;
  ddWagerSessionId?: string;
  mimeType?: string;
  dataBase64?: string;
};

type DailyDoubleHandlersCtx = CtxDeps<
  | "games"
  | "clearDdWagerTimer"
  | "transcribeAnswerAudio"
  | "parseDailyDoubleWager"
  | "broadcast"
  | "repromptDdWager"
  | "finalizeDailyDoubleWagerAndStartClue"
>;

export const dailyDoubleHandlers: Record<string, WsHandler> = {
  "daily-double-wager-audio-blob": async ({ ws, data, ctx }) => {
    const hctx = ctx as DailyDoubleHandlersCtx;
    const { gameId, ddWagerSessionId, mimeType, dataBase64 } =
      (data ?? {}) as DailyDoubleWagerAudioBlobData;
    const game = hctx.games?.[gameId];
    if (!game) return;
    const submission = validateDailyDoubleSubmission({
      game,
      ws,
      gameId,
      ddWagerSessionId,
      dataBase64,
    });
    if (submission.ok === false) {
      ws.send(JSON.stringify(submission.errorPayload));
      return;
    }
    const { playerUsername, playerDisplayname, buffer } = submission;

    hctx.clearDdWagerTimer(ctx, gameId, game);

    let transcript = "";
    try {
      const stt = await hctx.transcribeAnswerAudio(
        buffer,
        mimeType,
        null,
        game.lobbySettings.sttProviderName as Parameters<typeof hctx.transcribeAnswerAudio>[3],
      );
      transcript = String(stt || "").trim();
    } catch (e) {
      console.error("[dd-wager] STT failed:", e?.message || e);
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: "STT failed",
        }),
      );
      return;
    }

    const dd = game.dailyDouble;
    const maxWager = Number(dd?.maxWager || 0);

    const parsed = await hctx.parseDailyDoubleWager({
      transcriptRaw: transcript,
      maxWager,
    });

    const wager = parsed.wager;
    const reason = parsed.reason;

    hctx.broadcast(gameId, {
      type: "daily-double-wager-heard",
      gameId,
      username: playerUsername,
      displayname: playerDisplayname,
      transcript,
      parsedWager: wager,
      reason,
      maxWager,
    });

    if (wager === null) {
      await hctx.repromptDdWager(gameId, game, ctx, { reason: reason || "no-number" });
      return;
    }

    await hctx.finalizeDailyDoubleWagerAndStartClue(gameId, game, ctx, {
      wager,
      fallback: false,
      reason: null,
    });
  },
};
