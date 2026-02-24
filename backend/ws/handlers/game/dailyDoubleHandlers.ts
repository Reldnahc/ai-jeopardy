import type { PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";

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

    const norm = (v: unknown) =>
      String(v ?? "")
        .trim()
        .toLowerCase();

    if (game.phase !== "DD_WAGER_CAPTURE") {
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: `Not accepting DD wagers right now (phase=${String(game.phase)})`,
        }),
      );
      return;
    }

    if (!ddWagerSessionId || ddWagerSessionId !== game.ddWagerSessionId) {
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: "Stale or invalid DD wager session.",
        }),
      );
      return;
    }

    const player = game.players?.find((p: PlayerState) => p.id === ws.id);
    const playerUsername = norm(player?.username);
    const playerDisplayname = String(player?.displayname ?? "").trim() || null;

    const ddPlayerUsername = norm(game.dailyDouble?.playerUsername);
    if (!playerUsername || !ddPlayerUsername || playerUsername !== ddPlayerUsername) {
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: "You are not the Daily Double player.",
        }),
      );
      return;
    }

    if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: "Missing audio data.",
        }),
      );
      return;
    }

    let buf;
    try {
      buf = Buffer.from(dataBase64, "base64");
    } catch {
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: "Invalid base64 audio.",
        }),
      );
      return;
    }

    const MAX_BYTES = 2_000_000;
    if (buf.length > MAX_BYTES) {
      ws.send(
        JSON.stringify({
          type: "daily-double-error",
          gameId,
          ddWagerSessionId,
          message: "Audio too large.",
        }),
      );
      return;
    }

    hctx.clearDdWagerTimer(ctx, gameId, game);

    let transcript = "";
    try {
      const stt = await hctx.transcribeAnswerAudio(
        buf,
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

    dd.wager = wager;
    dd.stage = "clue";
    if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();
    game.usedDailyDoubles.add(dd.clueKey);

    game.phase = "clue";
    game.ddWagerSessionId = null;
    game.ddWagerDeadlineAt = null;

    hctx.broadcast(gameId, {
      type: "daily-double-wager-locked",
      gameId,
      username: playerUsername,
      displayname: playerDisplayname,
      wager,
    });

    await hctx.finalizeDailyDoubleWagerAndStartClue(gameId, game, ctx, {
      wager,
      fallback: false,
      reason: null,
    });
  },
};
