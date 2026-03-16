import { games } from "../state/gamesStore.js";
import { normalizeCategories11 } from "../validation/boardImport.js";
import type { GameState, PlayerState, SocketState } from "../types/runtime.js";
import type { LobbyStateMessage } from "../../shared/types/lobby.js";
import { toPlayerPayloads } from "./playerPayloads.js";

export const buildLobbyState = (gameId: string, ws: SocketState): LobbyStateMessage | null => {
  const game = games[gameId];
  if (!game) return null;

  const you = game.players?.find((p: PlayerState) => p.id === ws.id) || null;

  return {
    type: "lobby-state",
    gameId,
    players: toPlayerPayloads(game.players),
    host: typeof game.host === "string" ? game.host : null,
    categories: normalizeCategories11(game.categories),
    lockedCategories: game.lockedCategories,
    inLobby: game.inLobby,
    lobbySettings: game.lobbySettings ?? null,
    categoryPoolState: {
      nextAllowedAtMs: game.categoryPoolNextAllowedAtMs ?? null,
      generating: Boolean(game.categoryPoolGenerating),
      lastGeneratedAtMs: game.categoryPoolGeneratedAtMs ?? null,
    },
    isGenerating: Boolean(game.isGenerating),
    isLoading: Boolean(game.isLoading),
    generationProgress:
      typeof game.generationProgress === "number" ? game.generationProgress : null,
    generationDone: typeof game.generationDone === "number" ? game.generationDone : null,
    generationTotal: typeof game.generationTotal === "number" ? game.generationTotal : null,
    you: you
      ? {
          username: you.username,
          displayname: you.displayname,
          isHost:
            String(you.username ?? "")
              .trim()
              .toLowerCase() ===
            String(game.host ?? "")
              .trim()
              .toLowerCase(),
        }
      : null,
  };
};

export const getPlayerForSocket = (
  game: GameState | null | undefined,
  ws: SocketState | null | undefined,
): PlayerState | null => {
  if (!game || !ws) return null;
  return (game.players || []).find((p: PlayerState) => p.id === ws.id) || null;
};

export const sendLobbySnapshot = (ws: SocketState, gameId: string) => {
  const snap = buildLobbyState(gameId, ws);
  if (snap) ws.send(JSON.stringify(snap));
};
