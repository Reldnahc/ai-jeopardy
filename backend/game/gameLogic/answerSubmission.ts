import type { GameState, PlayerState, SocketState } from "../../types/runtime.js";
import { getActiveClueWorth, normUsername } from "./helpers.js";

type AnswerErrorPayload = {
  type: "answer-error";
  gameId: string;
  answerSessionId?: string;
  message: string;
};

type AnswerSubmissionResult =
  | {
      ok: true;
      playerUsername: string;
      playerDisplayname: string | null;
      buffer: Buffer;
    }
  | {
      ok: false;
      errorPayload: AnswerErrorPayload;
    };

export function createAnswerErrorPayload(args: {
  gameId: string;
  answerSessionId?: string;
  message: string;
}): AnswerErrorPayload {
  return {
    type: "answer-error",
    gameId: args.gameId,
    answerSessionId: args.answerSessionId,
    message: args.message,
  };
}

function getSubmittingPlayer(game: GameState, ws: SocketState): PlayerState | undefined {
  return game.players?.find((player) => player.id === ws.id);
}

export function validateAnswerSubmission(args: {
  game: GameState;
  ws: SocketState;
  gameId: string;
  answerSessionId?: string;
  dataBase64?: string;
  maxBytes?: number;
}): AnswerSubmissionResult {
  const { game, ws, gameId, answerSessionId, dataBase64, maxBytes = 2_000_000 } = args;
  const player = getSubmittingPlayer(game, ws);
  const playerDisplayname = String(player?.displayname ?? "").trim() || null;
  const playerUsername = normUsername(player?.username);

  if (game.phase !== "ANSWER_CAPTURE") {
    return {
      ok: false,
      errorPayload: createAnswerErrorPayload({
        gameId,
        answerSessionId,
        message: `Not accepting answers right now (phase=${String(game.phase)}, buzzed=${String(game.buzzed)}, selectedClue=${Boolean(game.selectedClue)})`,
      }),
    };
  }

  if (!answerSessionId || answerSessionId !== game.answerSessionId) {
    return {
      ok: false,
      errorPayload: createAnswerErrorPayload({
        gameId,
        answerSessionId,
        message: "Stale or invalid answer session.",
      }),
    };
  }

  const answeringUsername = normUsername(game.answeringPlayerUsername);
  if (!playerUsername || !answeringUsername || playerUsername !== answeringUsername) {
    return {
      ok: false,
      errorPayload: createAnswerErrorPayload({
        gameId,
        answerSessionId,
        message: "You are not the answering player.",
      }),
    };
  }

  if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
    return {
      ok: false,
      errorPayload: createAnswerErrorPayload({
        gameId,
        answerSessionId,
        message: "Missing audio data.",
      }),
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    return {
      ok: false,
      errorPayload: createAnswerErrorPayload({
        gameId,
        answerSessionId,
        message: "Invalid base64 audio.",
      }),
    };
  }

  if (buffer.length > maxBytes) {
    return {
      ok: false,
      errorPayload: createAnswerErrorPayload({
        gameId,
        answerSessionId,
        message: "Audio too large.",
      }),
    };
  }

  return {
    ok: true,
    playerUsername,
    playerDisplayname,
    buffer,
  };
}

type AnswerBroadcast = (gameId: string, payload: Record<string, unknown>) => void;

export function beginAnswerJudging(args: {
  game: GameState;
  gameId: string;
  answerSessionId: string;
  playerUsername: string;
  playerDisplayname: string | null;
  clearAnswerWindow: (game: GameState) => void;
  broadcast: AnswerBroadcast;
}): void {
  const { game, gameId, answerSessionId, playerUsername, playerDisplayname, clearAnswerWindow, broadcast } =
    args;

  clearAnswerWindow(game);
  broadcast(gameId, { type: "answer-capture-ended", gameId, answerSessionId });
  game.phase = "JUDGING";

  broadcast(gameId, {
    type: "answer-processing",
    gameId,
    answerSessionId,
    playerUsername,
    playerDisplayname,
    stage: "transcribing",
  });
}

export function resolveSuggestedDelta(
  game: GameState,
  verdict: string,
): number {
  const worth = getActiveClueWorth(game);
  return verdict === "correct" ? worth : verdict === "incorrect" ? -worth : 0;
}

export function applyAnswerResult(args: {
  game: GameState;
  verdict: string;
  transcript: string;
  confidence?: number | null;
}): void {
  const { game, verdict, transcript, confidence = null } = args;
  game.phase = "RESULT";
  game.answerTranscript = transcript;
  game.answerVerdict = verdict;
  game.answerConfidence = confidence;
}

export function buildAnswerResultPayload(args: {
  gameId: string;
  answerSessionId?: string;
  playerUsername: string;
  playerDisplayname: string | null;
  transcript: string;
  verdict: string;
  suggestedDelta: number;
  confidence?: number | null;
}) {
  return {
    type: "answer-result",
    gameId: args.gameId,
    answerSessionId: args.answerSessionId,
    username: args.playerUsername,
    displayname: args.playerDisplayname,
    transcript: args.transcript,
    verdict: args.verdict,
    confidence: args.confidence,
    suggestedDelta: args.suggestedDelta,
  };
}
