import type { GameState, SocketState } from "../types/runtime.js";

export function isHostSocket(game: GameState | null | undefined, ws: SocketState) {
  const hostPlayer = game.players?.find((p: { username?: string | null; id?: string | null }) => p.username === game.host);
  return hostPlayer && hostPlayer.id === ws.id;
}

export function requireHost(game: GameState | null | undefined, ws: SocketState) {
  return game && isHostSocket(game, ws);
}
