import type { GameState, PlayerState } from "../../types/runtime.js";
import { toPlayerPayloads } from "../../lobby/playerPayloads.js";

type PublicProfile = {
  displayname?: string | null;
  color?: string | null;
  text_color?: string | null;
};

type JoinPlayerArgs = {
  wsId: string;
  username: string;
  displayname?: unknown;
  profile?: PublicProfile | null;
};

type SessionPlayerRef = {
  wsId: string;
  username: string;
};

export function normalizeSessionUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function pickSessionDisplayname(value: unknown, fallbackUsername: string): string {
  const displayname = String(value ?? "").trim();
  return displayname || fallbackUsername;
}

export function findPlayerByUsername(game: GameState, username: string): PlayerState | undefined {
  return (game.players ?? []).find(
    (player) => normalizeSessionUsername(player.username) === username,
  );
}

export function attachPlayerSocket(
  player: PlayerState,
  wsId: string,
  displayname?: unknown,
): PlayerState {
  player.id = wsId;
  player.online = true;

  const nextDisplayname = String(displayname ?? "").trim();
  if (nextDisplayname) {
    player.displayname = nextDisplayname;
  }

  return player;
}

export function joinPlayerFromProfile(game: GameState, args: JoinPlayerArgs): PlayerState {
  const { wsId, username, displayname, profile } = args;
  const existingPlayer = findPlayerByUsername(game, username);
  if (existingPlayer) {
    return attachPlayerSocket(existingPlayer, wsId, displayname);
  }

  if (!Array.isArray(game.players)) {
    game.players = [];
  }

  const newPlayer: PlayerState = {
    id: wsId,
    username,
    displayname: pickSessionDisplayname(displayname, profile?.displayname || username),
    color: profile?.color || "bg-blue-500",
    text_color: profile?.text_color || "text-white",
    online: true,
  };

  game.players.push(newPlayer);
  return newPlayer;
}

export function getJoinedPlayer(game: GameState, ref: SessionPlayerRef): PlayerState | null {
  return (
    (game.players ?? []).find((player) => player.id === ref.wsId) ||
    findPlayerByUsername(game, ref.username) ||
    null
  );
}

export function buildAiHostPlaybackHydration(game: GameState, nowMs = Date.now()) {
  const playback = game.aiHostPlayback;
  if (!playback?.assetId || typeof playback.startedAtMs !== "number") {
    return null;
  }

  const elapsedMs = Math.max(0, nowMs - playback.startedAtMs);
  const durationMs =
    typeof playback.durationMs === "number" && Number.isFinite(playback.durationMs)
      ? Math.max(0, playback.durationMs)
      : null;

  const staleCutoffMs = durationMs != null ? durationMs + 250 : 15_000;
  if (elapsedMs >= staleCutoffMs) {
    return null;
  }

  return {
    assetId: playback.assetId,
    startedAtMs: playback.startedAtMs,
    durationMs,
    elapsedMs,
  };
}

function buildDailyDoubleModal(game: GameState) {
  const dailyDouble = game.dailyDouble || null;
  if (
    !dailyDouble ||
    (game.phase !== "DD_WAGER_CAPTURE" && dailyDouble.stage !== "wager_listen")
  ) {
    return null;
  }

  return {
    playerUsername: dailyDouble.playerUsername,
    maxWager: dailyDouble.maxWager,
  };
}

export function buildGameStatePayload(
  gameId: string,
  game: GameState,
  player: PlayerState | null,
  nowMs = Date.now(),
) {
  const myUsername = normalizeSessionUsername(player?.username);
  const aiHostPlayback = buildAiHostPlaybackHydration(game, nowMs);
  const finalists = Array.isArray(game.finalJeopardyFinalists)
    ? game.finalJeopardyFinalists
    : null;
  const fjDrawings =
    game.isFinalJeopardy && game.finalJeopardyStage === "finale" ? game.drawings || {} : null;

  return {
    type: "game-state" as const,
    gameId,
    players: toPlayerPayloads(game.players),
    host: game.host,
    buzzResult: game.buzzed,
    playerBuzzLockoutUntil: myUsername ? game.buzzLockouts?.[myUsername] || 0 : 0,
    clearedClues: Array.from(game.clearedClues || new Set()),
    boardData: game.boardData,
    selectedClue: game.selectedClue || null,
    buzzerLocked: game.buzzerLocked,
    scores: game.scores,
    timerEndTime: game.timerEndTime,
    timerDuration: game.timerDuration,
    timerVersion: game.timerVersion || 0,
    activeBoard: game.activeBoard || "firstBoard",
    isFinalJeopardy: Boolean(game.isFinalJeopardy),
    finalJeopardyStage: game.finalJeopardyStage || null,
    wagers: game.wagers || {},
    finalPlacements: game.finalPlacements || [],
    finalWagerDrawings: game.finalWagerDrawings || {},
    finalists,
    drawings: fjDrawings,
    dailyDouble: game.dailyDouble || null,
    ddWagerSessionId: game.ddWagerSessionId || null,
    ddWagerDeadlineAt: game.ddWagerDeadlineAt || null,
    ddShowModal: buildDailyDoubleModal(game),
    lobbySettings: game.lobbySettings || null,
    phase: game.phase || null,
    selectorKey: game.selectorKey || null,
    selectorName: game.selectorName || null,
    boardSelectionLocked: Boolean(game.boardSelectionLocked),
    boardSelectionLockReason: game.boardSelectionLockReason || null,
    boardSelectionLockVersion: game.boardSelectionLockVersion || 0,
    welcomeTtsAssetId: game.welcomeTtsAssetId || null,
    welcomeEndsAt: typeof game.welcomeEndsAt === "number" ? game.welcomeEndsAt : null,
    answeringPlayer: game.answeringPlayerUsername || null,
    answerSessionId: game.answerSessionId || null,
    answerDeadlineAt: game.answerDeadlineAt || null,
    answerClueKey: game.answerClueKey || null,
    aiHostPlayback,
  };
}

export function removePlayerFromGame(
  game: GameState,
  username: string,
  wsId: string,
): PlayerState | null {
  const leavingPlayer =
    (username && findPlayerByUsername(game, username)) ||
    (game.players ?? []).find((player) => player.id === wsId);

  if (!leavingPlayer) {
    return null;
  }

  const leavingUsername = normalizeSessionUsername(leavingPlayer.username);
  game.players = (game.players ?? []).filter(
    (player) => normalizeSessionUsername(player.username) !== leavingUsername,
  );

  if (game.wagers) delete game.wagers[leavingUsername];
  if (game.finalWagerDrawings) delete game.finalWagerDrawings[leavingUsername];
  if (game.drawings) delete game.drawings[leavingUsername];
  if (game.scores) delete game.scores[leavingUsername];
  if (game.buzzLockouts) delete game.buzzLockouts[leavingUsername];

  return leavingPlayer;
}
