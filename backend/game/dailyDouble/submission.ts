import type { GameState, PlayerState, SocketState } from "../../types/runtime.js";

type DailyDoubleErrorPayload = {
  type: "daily-double-error";
  gameId: string;
  ddWagerSessionId?: string;
  message: string;
};

type DailyDoubleSubmissionResult =
  | {
      ok: true;
      playerUsername: string;
      playerDisplayname: string | null;
      buffer: Buffer;
    }
  | {
      ok: false;
      errorPayload: DailyDoubleErrorPayload;
    };

function normalizeGameValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function createDailyDoubleErrorPayload(args: {
  gameId: string;
  ddWagerSessionId?: string;
  message: string;
}): DailyDoubleErrorPayload {
  return {
    type: "daily-double-error",
    gameId: args.gameId,
    ddWagerSessionId: args.ddWagerSessionId,
    message: args.message,
  };
}

function getSubmittingPlayer(game: GameState, ws: SocketState): PlayerState | undefined {
  return game.players?.find((player) => player.id === ws.id);
}

export function validateDailyDoubleSubmission(args: {
  game: GameState;
  ws: SocketState;
  gameId: string;
  ddWagerSessionId?: string;
  dataBase64?: string;
  maxBytes?: number;
}): DailyDoubleSubmissionResult {
  const { game, ws, gameId, ddWagerSessionId, dataBase64, maxBytes = 2_000_000 } = args;

  if (game.phase !== "DD_WAGER_CAPTURE") {
    return {
      ok: false,
      errorPayload: createDailyDoubleErrorPayload({
        gameId,
        ddWagerSessionId,
        message: `Not accepting DD wagers right now (phase=${String(game.phase)})`,
      }),
    };
  }

  if (!ddWagerSessionId || ddWagerSessionId !== game.ddWagerSessionId) {
    return {
      ok: false,
      errorPayload: createDailyDoubleErrorPayload({
        gameId,
        ddWagerSessionId,
        message: "Stale or invalid DD wager session.",
      }),
    };
  }

  const player = getSubmittingPlayer(game, ws);
  const playerUsername = normalizeGameValue(player?.username);
  const playerDisplayname = String(player?.displayname ?? "").trim() || null;
  const ddPlayerUsername = normalizeGameValue(game.dailyDouble?.playerUsername);

  if (!playerUsername || !ddPlayerUsername || playerUsername !== ddPlayerUsername) {
    return {
      ok: false,
      errorPayload: createDailyDoubleErrorPayload({
        gameId,
        ddWagerSessionId,
        message: "You are not the Daily Double player.",
      }),
    };
  }

  if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
    return {
      ok: false,
      errorPayload: createDailyDoubleErrorPayload({
        gameId,
        ddWagerSessionId,
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
      errorPayload: createDailyDoubleErrorPayload({
        gameId,
        ddWagerSessionId,
        message: "Invalid base64 audio.",
      }),
    };
  }

  if (buffer.length > maxBytes) {
    return {
      ok: false,
      errorPayload: createDailyDoubleErrorPayload({
        gameId,
        ddWagerSessionId,
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
