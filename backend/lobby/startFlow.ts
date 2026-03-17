import type { GameState, PlayerState } from "../types/runtime.js";

type StableIdResolver = (player: PlayerState) => unknown;

export function chooseStartingSelector(
  game: GameState,
  random: () => number = Math.random,
): PlayerState | null {
  const players = Array.isArray(game.players) ? game.players : [];
  const online = players.filter((player) => player?.online !== false);
  const pool = online.length > 0 ? online : players;
  const pick = pool.length > 0 ? pool[Math.floor(random() * pool.length)] ?? null : null;

  game.selectorKey = pick?.username ?? null;
  game.selectorName = pick?.displayname ?? null;

  return pick;
}

export function clearWelcomeTimer(game: GameState): void {
  if (game.welcomeTimer) {
    clearTimeout(game.welcomeTimer);
    game.welcomeTimer = null;
  }
}

export function resetLobbyStartPhase(game: GameState): void {
  game.phase = null;
  game.welcomeEndsAt = null;
  clearWelcomeTimer(game);
}

export function getRequiredStableIds(
  game: GameState,
  playerStableId: StableIdResolver,
): string[] {
  return (game.players ?? [])
    .filter((player) => player.online)
    .map((player) =>
      String(playerStableId(player) ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

export function acknowledgePreloadDone(args: {
  game: GameState;
  stableId: string;
  token: number;
  playerStableId: StableIdResolver;
}): boolean {
  const { game, stableId, token, playerStableId } = args;
  if (!game.preload) return false;

  const finalToken = Number(game.preload.finalToken) || 0;
  game.preload.acksByPlayer ||= {};
  game.preload.acksByPlayer[stableId] = Number.isFinite(token) ? token : finalToken;

  if (!finalToken) return false;

  if (
    !Array.isArray(game.preload.requiredForToken) ||
    game.preload.requiredForToken.length === 0
  ) {
    game.preload.requiredForToken = getRequiredStableIds(game, playerStableId);
  }

  return game.preload.requiredForToken.every(
    (requiredId) => game.preload?.acksByPlayer?.[requiredId] === finalToken,
  );
}

export function activateGameReadyHandshake(
  game: GameState,
  playerStableId: StableIdResolver,
  aiHostName: string = "AI Jeopardy",
): void {
  game.preload = {
    ...(game.preload ?? {}),
    active: false,
  };
  game.inLobby = false;
  game.isLoading = false;
  if (!game.lobbyHost) game.lobbyHost = game.host;
  game.host = aiHostName;

  const expectedIds = getRequiredStableIds(game, playerStableId);
  game.gameReady = {
    expected: Object.fromEntries(expectedIds.map((id) => [id, true])) as Record<string, boolean>,
    acks: {},
    done: false,
  };

  game.phase = null;
}

export function acknowledgeGameReady(game: GameState, stableId: string): boolean {
  if (!game.gameReady || game.gameReady.done || !game.gameReady.expected?.[stableId]) {
    return false;
  }

  game.gameReady.acks ||= {};
  game.gameReady.acks[stableId] = true;

  const expectedIds = Object.keys(game.gameReady.expected);
  const allReady = expectedIds.every((id) => game.gameReady?.acks?.[id]);
  if (!allReady) return false;

  game.gameReady.done = true;
  return true;
}

export function enterWelcomePhase(game: GameState): void {
  game.phase = "welcome";
  game.welcomeEndsAt = null;
}

export function enterBoardPhase(game: GameState): void {
  game.phase = "board";
  game.welcomeEndsAt = null;
}
