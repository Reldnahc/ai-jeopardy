import type { GameState, PlayerState } from "../../../types/runtime.js";
import type { WsHandler } from "../types.js";

type JoinGameData = { gameId: string; username?: string; displayname?: string };
type LeaveGameData = { gameId: string; username?: string };

function normUsername(u: unknown): string {
  return String(u ?? "")
    .trim()
    .toLowerCase();
}

function pickDisplayname(d: unknown, fallbackUsername: string): string {
  const s = String(d ?? "").trim();
  return s || fallbackUsername;
}

export const sessionHandlers: Record<string, WsHandler> = {
  "join-game": async ({ ws, data, ctx }) => {
    const { gameId, username, displayname } = (data ?? {}) as JoinGameData;
    const u = normUsername(username);

    if (!u) {
      ws.send(JSON.stringify({ type: "error", message: "Username cannot be blank." }));
      return;
    }

    if (!ctx.games?.[gameId]) {
      ws.send(JSON.stringify({ type: "error", message: "Game does not exist!" }));
      return;
    }

    const game = ctx.games[gameId] as GameState;

    let player = (game.players ?? []).find((p: PlayerState) => normUsername(p.username) === u);

    if (player) {
      console.log(`[Server] Player ${u} reconnected to Game ${gameId}`);
      player.id = ws.id;
      player.online = true;

      if (String(displayname ?? "").trim()) {
        player.displayname = String(displayname).trim();
      }

      ws.gameId = gameId;
    } else {
      const profile = await ctx.repos.profiles.getPublicProfileByUsername(u);

      player = (game.players ?? []).find((p: PlayerState) => normUsername(p.username) === u);
      if (player) {
        player.id = ws.id;
        player.online = true;
        ws.gameId = gameId;
      } else {
        const dn = pickDisplayname(displayname, profile?.displayname || u);

        const newPlayer = {
          id: ws.id,
          username: u,
          displayname: dn,
          color: profile?.color || "bg-blue-500",
          text_color: profile?.text_color || "text-white",
          online: true,
        };

        game.players.push(newPlayer);
        ws.gameId = gameId;
      }
    }

    const me =
      game.players.find((p: PlayerState) => p.id === ws.id) ||
      game.players.find((p: PlayerState) => normUsername(p.username) === u) ||
      null;

    const myUsername = normUsername(me?.username);
    const myLockoutUntil = myUsername ? game.buzzLockouts?.[myUsername] || 0 : 0;

    const dd = game.dailyDouble || null;
    const ddShowModal =
      dd && (game.phase === "DD_WAGER_CAPTURE" || dd.stage === "wager_listen")
        ? { playerUsername: dd.playerUsername, maxWager: dd.maxWager }
        : null;

    const finalists = Array.isArray(game.finalJeopardyFinalists)
      ? game.finalJeopardyFinalists
      : null;

    const fjDrawings =
      game.isFinalJeopardy && game.finalJeopardyStage === "finale" ? game.drawings || {} : null;

    const aiHostPlayback = (() => {
      const playback = game.aiHostPlayback;
      if (!playback?.assetId || typeof playback.startedAtMs !== "number") return null;

      const now = Date.now();
      const elapsedMs = Math.max(0, now - playback.startedAtMs);
      const durationMs =
        typeof playback.durationMs === "number" && Number.isFinite(playback.durationMs)
          ? Math.max(0, playback.durationMs)
          : null;

      const staleCutoffMs = durationMs != null ? durationMs + 250 : 15_000;
      if (elapsedMs >= staleCutoffMs) return null;

      return {
        assetId: playback.assetId,
        startedAtMs: playback.startedAtMs,
        durationMs,
        elapsedMs,
      };
    })();

    ws.send(
      JSON.stringify({
        type: "game-state",
        gameId,
        players: game.players.map((p: PlayerState) => ({
          username: p.username,
          displayname: p.displayname,
          online: p?.online !== false,
        })),
        host: game.host,
        buzzResult: game.buzzed,
        playerBuzzLockoutUntil: myLockoutUntil,
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
        finalists,
        drawings: fjDrawings,
        dailyDouble: dd,
        ddWagerSessionId: game.ddWagerSessionId || null,
        ddWagerDeadlineAt: game.ddWagerDeadlineAt || null,
        ddShowModal,
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
      }),
    );

    if (aiHostPlayback?.assetId) {
      ws.send(
        JSON.stringify({
          type: "ai-host-say",
          assetId: aiHostPlayback.assetId,
          startedAtMs: aiHostPlayback.startedAtMs,
          durationMs: aiHostPlayback.durationMs ?? undefined,
          elapsedMs: aiHostPlayback.elapsedMs,
        }),
      );
    }

    ctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: p?.online !== false,
      })),
      host: game.host,
    });
  },

  "leave-game": async ({ ws, data, ctx }) => {
    const { gameId, username } = (data ?? {}) as LeaveGameData;
    if (!gameId || !ctx.games?.[gameId]) return;

    const game = ctx.games[gameId] as GameState;
    const u = normUsername(username);

    const leavingPlayer =
      (u && game.players.find((p: PlayerState) => normUsername(p.username) === u)) ||
      game.players.find((p: PlayerState) => p.id === ws.id);

    if (!leavingPlayer) return;
    const leavingUsername = normUsername(leavingPlayer.username);

    game.players = game.players.filter(
      (p: PlayerState) => normUsername(p.username) !== leavingUsername,
    );

    if (game.wagers) delete game.wagers[leavingUsername];
    if (game.drawings) delete game.drawings[leavingUsername];
    if (game.scores) delete game.scores[leavingUsername];
    if (game.buzzLockouts) delete game.buzzLockouts[leavingUsername];

    if (game.players.length === 0) {
      delete ctx.games[gameId];
      return;
    }

    ws.gameId = null;

    ctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: p?.online !== false,
      })),
      host: game.host,
    });

    ctx.checkAllWagersSubmitted(game, gameId, ctx);
    ctx.checkAllDrawingsSubmitted(game, gameId, ctx);
  },
};
