import type { PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import {
  applyAnswerResult,
  beginAnswerJudging,
  buildAnswerResultPayload,
  resolveSuggestedDelta,
  validateAnswerSubmission,
} from "../../../game/gameLogic/answerSubmission.js";

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
    const submission = validateAnswerSubmission({
      game,
      ws,
      gameId,
      answerSessionId,
      dataBase64,
    });
    const player = game.players?.find((p: PlayerState) => p.id === ws.id);
    const fallbackUsername = String(player?.username ?? "")
      .trim()
      .toLowerCase();
    if (submission.ok === false) {
      ws.send(JSON.stringify(submission.errorPayload));
      return ctx
        .autoResolveAfterJudgement(ctx, gameId, game, fallbackUsername, "incorrect")
        .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
    }
    const { playerUsername, playerDisplayname, buffer } = submission;

    beginAnswerJudging({
      game,
      gameId,
      answerSessionId: answerSessionId ?? "",
      playerUsername,
      playerDisplayname,
      clearAnswerWindow: (currentGame) => hctx.clearAnswerWindow(currentGame),
      broadcast: (currentGameId, payload) => hctx.broadcast(currentGameId, payload),
    });

    let transcript = "";
    try {
      const stt = await hctx.transcribeAnswerAudio(
        buffer,
        mimeType,
        game.selectedClue?.answer,
        game.lobbySettings.sttProviderName as Parameters<typeof hctx.transcribeAnswerAudio>[3],
      );
      transcript = String(stt || "").trim();

      if (!transcript) {
        applyAnswerResult({
          game,
          verdict: "incorrect",
          transcript: "",
          confidence: 0.0,
        });

        hctx.broadcast(
          gameId,
          buildAnswerResultPayload({
            gameId,
            answerSessionId,
            playerUsername,
            playerDisplayname,
            transcript: "",
            verdict: "incorrect",
            confidence: 0.0,
            suggestedDelta: resolveSuggestedDelta(game, "incorrect"),
          }),
        );

        return ctx
          .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
          .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
      }
    } catch (e) {
      console.error("[answer-audio-blob] STT failed:", e?.message || e);
      applyAnswerResult({
        game,
        verdict: "incorrect",
        transcript: "",
        confidence: 0.0,
      });

      hctx.broadcast(
        gameId,
        buildAnswerResultPayload({
          gameId,
          answerSessionId,
          playerUsername,
          playerDisplayname,
          transcript: "",
          verdict: "incorrect",
          confidence: 0.0,
          suggestedDelta: resolveSuggestedDelta(game, "incorrect"),
        }),
      );

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
      const category = String(game.selectedClue?.category || "");
      verdict = (
        await hctx.judgeClueAnswerFast(expectedAnswer, transcript, game.selectedClue.question, category)
      ).verdict;
    } catch (e) {
      console.error("[answer-audio-blob] judge failed:", e?.message || e);
      verdict = "incorrect";
    }

    applyAnswerResult({
      game,
      verdict,
      transcript,
    });

    hctx.broadcast(
      gameId,
      buildAnswerResultPayload({
        gameId,
        answerSessionId,
        playerUsername,
        playerDisplayname,
        transcript,
        verdict,
        suggestedDelta: resolveSuggestedDelta(game, verdict),
      }),
    );

    return ctx
      .autoResolveAfterJudgement(ctx, gameId, game, playerUsername, verdict)
      .catch((e: unknown) => console.error("[answer-audio-blob] autoResolve failed:", e));
  },
};
