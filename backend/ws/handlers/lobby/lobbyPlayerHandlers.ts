import type { JsonMap, PlayerState } from "../../../types/runtime.js";
import type { WsHandler } from "../types.js";

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

export const lobbyPlayerHandlers: Record<string, WsHandler> = {
  "create-lobby": async ({ ws, data, ctx }) => {
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
    } while (ctx.games[newGameId]);

    ws.gameId = newGameId;

    ctx.games[newGameId] = {
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
      categories: ctx.normalizeCategories11(categories),
      lobbySettings: {
        timeToBuzz: 10,
        timeToAnswer: 10,
        selectedModel: ctx.appConfig.ai.defaultModel,
        reasoningEffort: "off",
        visualMode: "off",
        narrationEnabled: true,
        boardJson: "",
        sttProviderName: ctx.appConfig.ai.defaultSttProvider,
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
      categories: ctx.games[newGameId].categories,
      players: ctx.games[newGameId].players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: u,
    });

    sendTimed("lobby-state", ctx.buildLobbyState(newGameId, ws));

    const total = Date.now() - startedAt;
    if (total > 1000) {
      console.warn(`[create-lobby][${reqId}] TOTAL SLOW`, { totalMs: total, gameId: newGameId });
    }
  },

  "join-lobby": async ({ ws, data, ctx }) => {
    const { gameId, username, displayname, playerKey } = (data ?? {}) as JoinLobbyData;

    if (!gameId || !ctx.games?.[gameId]) {
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

    const game = ctx.games[gameId];
    ctx.cancelLobbyCleanup(game);

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
        game.players.push({
          id: ws.id,
          username: u,
          displayname: dn,
          playerKey: stableKey,
          online: true,
        });

        ws.gameId = gameId;
        ctx.scheduleLobbyCleanupIfEmpty(gameId);
      }
    }

    ws.send(JSON.stringify(ctx.buildLobbyState(gameId, ws)));

    ctx.broadcast(gameId, {
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
    const { gameId, playerKey, username } = (data ?? {}) as LeaveLobbyData;

    const effectiveGameId =
      (gameId && ctx.games?.[gameId] ? gameId : null) ??
      (ws.gameId && ctx.games?.[ws.gameId] ? ws.gameId : null);

    if (!effectiveGameId || !ctx.games[effectiveGameId]) return;

    const game = ctx.games[effectiveGameId];
    if (!game.inLobby) return;

    const stable =
      String(playerKey ?? "").trim() ||
      String(username ?? "")
        .trim()
        .toLowerCase();
    if (!stable) return;

    const before = game.players.length;

    game.players = game.players.filter((p: PlayerState) => {
      const pid = ctx.playerStableId(p);
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
        ctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
        return;
      }
      game.host = String(game.players[0].username ?? "")
        .trim()
        .toLowerCase();
    }

    ctx.broadcast(effectiveGameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host,
    });

    ctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
  },
};
