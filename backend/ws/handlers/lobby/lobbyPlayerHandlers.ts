import type { JsonMap, PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { MAX_LOBBY_PLAYERS } from "../../../lobby/constants.js";

type CreateLobbyData = {
  username?: string;
  displayname?: string;
  playerKey?: string;
  categories?: unknown;
};
type JoinLobbyData = {
  gameId: string;
  username?: string;
  displayname?: string;
  playerKey?: string;
};
type LeaveLobbyData = { gameId?: string; playerKey?: string; username?: string };

type LobbyPlayerCtx = CtxDeps<
  | "games"
  | "normalizeCategories11"
  | "appConfig"
  | "buildLobbyState"
  | "cancelLobbyCleanup"
  | "scheduleLobbyCleanupIfEmpty"
  | "broadcast"
  | "playerStableId"
>;

export const lobbyPlayerHandlers: Record<string, WsHandler> = {
  "create-lobby": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyPlayerCtx;
    const startedAt = Date.now();
    const reqId = `${startedAt}-${Math.random().toString(16).slice(2, 6)}`;

    const sendTimed = (type: string, payloadObj: JsonMap) => {
      const t0 = Date.now();
      try {
        ws.send(JSON.stringify(payloadObj));
      } catch (e) {
        console.error(`[create-lobby][${reqId}] ws.send failed (${type})`, e);
        return;
      }
      const dt = Date.now() - t0;
      if (dt > 50) console.warn(`[create-lobby][${reqId}] ws.send slow (${type})`, { ms: dt });
    };

    const { username, displayname, playerKey, categories } = (data ?? {}) as CreateLobbyData;

    const u = String(username ?? "")
      .trim()
      .toLowerCase();
    if (!u) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid username." }));
      return;
    }

    const dnRaw = String(displayname ?? "").trim();
    const dn = dnRaw.length ? dnRaw : u;
    const stableKey = typeof playerKey === "string" && playerKey.trim() ? playerKey.trim() : null;

    let newGameId;
    do {
      newGameId = Math.random().toString(36).substr(2, 5).toUpperCase();
    } while (hctx.games[newGameId]);

    ws.gameId = newGameId;

    hctx.games[newGameId] = {
      host: u,
      players: [
        {
          id: ws.id,
          username: u,
          displayname: dn,
          playerKey: stableKey,
          online: true,
        },
      ],
      inLobby: true,
      createdAt: Date.now(),
      categories: hctx.normalizeCategories11(categories),
      lobbySettings: {
        timeToBuzz: 10,
        timeToAnswer: 10,
        selectedModel: hctx.appConfig.ai.defaultModel,
        reasoningEffort: "off",
        visualMode: "off",
        narrationEnabled: true,
        boardJson: "",
        sttProviderName: hctx.appConfig.ai.defaultSttProvider,
      },
      lockedCategories: {
        firstBoard: Array(5).fill(false),
        secondBoard: Array(5).fill(false),
        finalJeopardy: Array(1).fill(false),
      },
      activeBoard: "firstBoard",
      isFinalJeopardy: false,
      finalJeopardyStage: null,
      emptySince: null,
      cleanupTimer: null,
    };

    sendTimed("lobby-created", {
      type: "lobby-created",
      gameId: newGameId,
      categories: hctx.games[newGameId].categories,
      players: hctx.games[newGameId].players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: u,
    });

    sendTimed("lobby-state", hctx.buildLobbyState(newGameId, ws));

    const total = Date.now() - startedAt;
    if (total > 1000) {
      console.warn(`[create-lobby][${reqId}] TOTAL SLOW`, { totalMs: total, gameId: newGameId });
    }
  },

  "join-lobby": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyPlayerCtx;
    const { gameId, username, displayname, playerKey } = (data ?? {}) as JoinLobbyData;

    if (!gameId || !hctx.games?.[gameId]) {
      ws.send(JSON.stringify({ type: "error", message: "Lobby does not exist!" }));
      return;
    }

    const u = String(username ?? "")
      .trim()
      .toLowerCase();
    if (!u) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid username." }));
      return;
    }

    const dnRaw = String(displayname ?? "").trim();
    const dn = dnRaw.length ? dnRaw : u;

    const game = hctx.games[gameId];
    hctx.cancelLobbyCleanup(game);

    const stableKey = typeof playerKey === "string" && playerKey.trim() ? playerKey.trim() : null;

    const existingByKey = stableKey
      ? game.players.find((p: PlayerState) => p.playerKey && p.playerKey === stableKey)
      : null;

    const existingByUsername = game.players.find(
      (p: PlayerState) =>
        String(p.username ?? "")
          .trim()
          .toLowerCase() === u,
    );

    const attachSocket = (player: PlayerState) => {
      player.id = ws.id;
      player.online = true;
      player.username = u;
      player.displayname = dn;
      if (stableKey && !player.playerKey) player.playerKey = stableKey;
      ws.gameId = gameId;
    };

    if (existingByKey) {
      console.log(`[Server] PlayerKey reconnect for ${u} -> Lobby ${gameId}`);
      attachSocket(existingByKey);
    } else if (existingByUsername) {
      console.log(`[Server] Username reconnect for ${u} -> Lobby ${gameId}`);
      attachSocket(existingByUsername);
    } else {
      const race = stableKey
        ? game.players.find((p: PlayerState) => p.playerKey === stableKey)
        : game.players.find(
            (p: PlayerState) =>
              String(p.username ?? "")
                .trim()
                .toLowerCase() === u,
          );

      if (race) {
        attachSocket(race);
      } else {
        if (game.players.length >= MAX_LOBBY_PLAYERS) {
          ws.send(JSON.stringify({ type: "error", message: "Lobby is full (max 5 players)." }));
          return;
        }

        game.players.push({
          id: ws.id,
          username: u,
          displayname: dn,
          playerKey: stableKey,
          online: true,
        });

        ws.gameId = gameId;
        hctx.scheduleLobbyCleanupIfEmpty(gameId);
      }
    }

    ws.send(JSON.stringify(hctx.buildLobbyState(gameId, ws)));

    hctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host,
    });
  },

  "leave-lobby": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyPlayerCtx;
    const { gameId, playerKey, username } = (data ?? {}) as LeaveLobbyData;

    const effectiveGameId =
      (gameId && hctx.games?.[gameId] ? gameId : null) ??
      (ws.gameId && hctx.games?.[ws.gameId] ? ws.gameId : null);

    if (!effectiveGameId || !hctx.games[effectiveGameId]) return;

    const game = hctx.games[effectiveGameId];
    if (!game.inLobby) return;

    const stable =
      String(playerKey ?? "").trim() ||
      String(username ?? "")
        .trim()
        .toLowerCase();
    if (!stable) return;

    const before = game.players.length;

    game.players = game.players.filter((p: PlayerState) => {
      const pid = hctx.playerStableId(p);
      return pid !== stable;
    });

    if (game.players.length === before) return;

    if (
      String(game.host ?? "")
        .trim()
        .toLowerCase() ===
      String(username ?? "")
        .trim()
        .toLowerCase()
    ) {
      if (game.players.length === 0) {
        hctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
        return;
      }
      game.host = String(game.players[0].username ?? "")
        .trim()
        .toLowerCase();
    }

    hctx.broadcast(effectiveGameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host,
    });

    hctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
  },
};
