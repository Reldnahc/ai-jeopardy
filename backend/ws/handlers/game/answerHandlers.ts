import type { PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";

type AnswerAudioBlobData = {
  gameId: string;
  answerSessionId?: string;
  mimeType?: string;
  dataBase64?: string;
};

type AnswerHandlersCtx = CtxDeps<
  | "games"
  | "autoResolveAfterJudgement"
  | "clearAnswerWindow"
  | "broadcast"
  | "transcribeAnswerAudio"
  | "judgeClueAnswerFast"
  | "parseClueValue"
>;

export const answerHandlers: Record<string, WsHandler> = {
  "answer-audio-blob": async ({ ws, data, ctx }) => {
    const hctx = ctx as AnswerHandlersCtx;
    const { gameId, answerSessionId, mimeType, dataBase64 } = (data || {}) as AnswerAudioBlobData;
    const game = hctx.games?.[gameId];
    if (!game) return;

    const norm = (v: unknown) =>
      String(v ?? "")
        .trim()
        .toLowerCase();

    const player = game.players?.find((p: PlayerState) => p.id === ws.id);
    const playerDisplayname = String(player?.displayname ?? "").trim() || null;
    const playerUsername = norm(player?.username);

    if (game.phase !== "ANSWER_CAPTURE") {
      ws.send(
        JSON.stringify({
          type: "answer-error",
          gameId,
          answerSessionId,
          message: `Not accepting answers right now (phase=${String(game.phase)}, buzzed=${String(game.buzzed)}, selectedClue=${Boolean(game.selectedClue)})`,
        }),
      );
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }

    if (!answerSessionId || answerSessionId !== game.answerSessionId) {
      ws.send(
        JSON.stringify({
          type: "answer-error",
          gameId,
          answerSessionId,
          message: "Stale or invalid answer session.",
        }),
      );
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }

    const answeringUsername = norm(game.answeringPlayerUsername);
    if (!playerUsername || !answeringUsername || playerUsername !== answeringUsername) {
      ws.send(
        JSON.stringify({
          type: "answer-error",
          gameId,
          answerSessionId,
          message: "You are not the answering player.",
        }),
      );
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }

    if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
      ws.send(
        JSON.stringify({
          type: "answer-error",
          gameId,
          answerSessionId,
          message: "Missing audio data.",
        }),
      );
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }

    let buf;
    try {
      buf = Buffer.from(dataBase64, "base64");
    } catch {
      ws.send(
        JSON.stringify({
          type: "answer-error",
          gameId,
          answerSessionId,
          message: "Invalid base64 audio.",
        }),
      );
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }

    const MAX_BYTES = 2_000_000;
    if (buf.length > MAX_BYTES) {
      ws.send(
        JSON.stringify({
          type: "answer-error",
          gameId,
          answerSessionId,
          message: "Audio too large.",
        }),
      );
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }

    hctx.clearAnswerWindow(game);
    hctx.broadcast(gameId, { type: "answer-capture-ended", gameId, answerSessionId });
    game.phase = "JUDGING";

    hctx.broadcast(gameId, {
      type: "answer-processing",
      gameId,
      answerSessionId,
      playerUsername,
      playerDisplayname,
      stage: "transcribing",
    });

    let transcript = "";
    try {
      const stt = await hctx.transcribeAnswerAudio(
        buf,
        mimeType,
        game.selectedClue?.answer,
        game.lobbySettings.sttProviderName as Parameters<typeof hctx.transcribeAnswerAudio>[3],
      );
      transcript = String(stt || "").trim();

      if (!transcript) {
        const parseValue = (val: unknown) => {
          const n = Number(String(val || "").replace(/[^0-9]/g, ""));
          return Number.isFinite(n) ? n : 0;
        };

        const ddWorth =
          game.dailyDouble?.clueKey === game.clueState?.clueKey &&
          Number.isFinite(Number(game.dailyDouble?.wager))
            ? Number(game.dailyDouble.wager)
            : null;

        const worth = ddWorth !== null ? ddWorth : parseValue(game.selectedClue?.value);

        game.phase = "RESULT";
        game.answerTranscript = "";
        game.answerVerdict = "incorrect";
        game.answerConfidence = 0.0;

        hctx.broadcast(gameId, {
          type: "answer-result",
          gameId,
          answerSessionId,
          username: playerUsername,
          displayname: playerDisplayname,
          transcript: "",
          verdict: "incorrect",
          confidence: 0.0,
          suggestedDelta: -worth,
        });

        return ctx
          .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
          .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
      }
    } catch (e) {
      console.error("[answer-audio-blob] STT failed:", e?.message || e);

      const parseValue = (val: unknown) => {
        const n = Number(String(val || "").replace(/[^0-9]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      const clueValue = parseValue(game.selectedClue?.value);

      game.phase = "RESULT";
      game.answerTranscript = "";
      game.answerVerdict = "incorrect";
      game.answerConfidence = 0.0;

      hctx.broadcast(gameId, {
        type: "answer-result",
        gameId,
        answerSessionId,
        username: playerUsername,
        displayname: playerDisplayname,
        transcript: "",
        verdict: "incorrect",
        confidence: 0.0,
        suggestedDelta: -clueValue,
      });

      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
        .catch((err: unknown) =>
          console.error("[answer-audio-blob-error] autoResolve failed:", err),
        );
    }

    hctx.broadcast(gameId, {
      type: "answer-transcript",
      gameId,
      answerSessionId,
      playerUsername,
      playerDisplayname,
      transcript,
      isFinal: true,
    });

    let verdict: string;
    try {
      const expectedAnswer = String(game.selectedClue?.answer || "");
      verdict = (
        await hctx.judgeClueAnswerFast(expectedAnswer, transcript, game.selectedClue.question)
      ).verdict;
    } catch (e) {
      console.error("[answer-audio-blob] judge failed:", e?.message || e);
      verdict = "incorrect";
    }

    const clueValue = hctx.parseClueValue(game.selectedClue?.value);
    const ddWorth =
      game.dailyDouble?.clueKey === game.clueState?.clueKey &&
      Number.isFinite(Number(game.dailyDouble?.wager))
        ? Number(game.dailyDouble.wager)
        : null;
    const worth = ddWorth !== null ? ddWorth : clueValue;
    const suggestedDelta = verdict === "correct" ? worth : verdict === "incorrect" ? -worth : 0;

    game.phase = "RESULT";
    game.answerTranscript = transcript;
    game.answerVerdict = verdict;

    hctx.broadcast(gameId, {
      type: "answer-result",
      gameId,
      answerSessionId,
      username: playerUsername,
      displayname: playerDisplayname,
      transcript,
      verdict,
      suggestedDelta,
    });

    return ctx
      .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, verdict)
      .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
  },
};
