function normalizeBgColor(input, fallback = "bg-blue-500") {
  const s = String(input ?? "").trim();
  if (/^bg-[a-z]+-\d{3}$/.test(s)) return s; // tailwind class
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s; // allow hex if you support it
  return fallback;
}

function normalizeTextColor(input, fallback = "text-white") {
  const s = String(input ?? "").trim();
  if (/^text-[a-z]+-\d{3}$/.test(s)) return s;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  return fallback;
}

export const lobbyHandlers = {
  "create-game": async ({ ws, data, ctx }) => {
    const { gameId } = data ?? {};

    // Use server-authoritative host name for trace context (no client spoofing)
    const serverHost = gameId && ctx.games?.[gameId]?.host ? ctx.games[gameId].host : undefined;
    const trace = ctx.createTrace("create-game", { gameId, host: serverHost });
    trace.mark("ws_received", { type: "create-game" });

    const game = ctx.getGameOrFail({ ws, ctx, gameId });
    if (!game) return;

    // Host-only
    if (!ctx.ensureHostOrFail({ ws, ctx, gameId, game })) return;

    const s = ctx.ensureLobbySettings(ctx, game, ctx.appConfig);

    const host = game.host;
    const categories = game.categories;
    const role = ctx.normalizeRole(ws);

    const selectedModel = s.selectedModel;
    const modelInfo = ctx.resolveModelOrFail({ ws, ctx, gameId, game, selectedModel, role });
    if (!modelInfo) return;

    const timeToBuzz = s.timeToBuzz;
    const timeToAnswer = s.timeToAnswer;
    const reasoningEffort = s.reasoningEffort;

    const boardJson = typeof s.boardJson === "string" ? s.boardJson : "";
    const visualMode = s.visualMode;

    const {
      usingImportedBoard,
      effectiveIncludeVisuals,
      requestedProvider,
      canUseBrave,
      effectiveImageProvider,
    } = ctx.resolveVisualPolicy({ role, boardJson, visualMode });

    trace.mark("visual_settings", {
      usingImportedBoard,
      includeVisuals: effectiveIncludeVisuals,
      requestedProvider,
      effectiveImageProvider,
      canUseBrave,
      visualMode,
    });

    if (!game.inLobby) {
      ws.send(JSON.stringify({ type: "error", message: "Game has already started." }));
      return;
    }

    ctx.resetGenerationProgressAndNotify({ ctx, gameId, game });

    ctx.initPreloadState({ ctx, gameId, game, trace });

    // Build AI-host phrase bank + player name callouts and PRELOAD them as soon as they're ready.
    // IMPORTANT: this runs in parallel with board generation so clients can start downloading immediately.
    void (async () => {
      try {
        await ctx.ensureAiHostTtsBank({ ctx, game, trace });
        const ids = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];

        ctx.broadcastPreloadBatch({
          ctx,
          gameId,
          game,
          imageAssetIds: [],
          ttsAssetIds: ids,
          final: false,
          trace,
          reason: "ai-host-bank",
        });
      } catch (e) {
        console.error("[create-game] ai host tts bank failed:", e);
        game.aiHostTts = {
          slotAssets: {},
          nameAssetsByPlayer: {},
          allAssetIds: [],
          categoryAssetsByCategory: {},
        };
      }
    })();

    const boardData = await ctx.getBoardDataOrFail({
      ctx,
      game,
      gameId,
      categories,
      selectedModel,
      host,
      boardJson,
      effectiveIncludeVisuals,
      effectiveImageProvider,
      reasoningEffort,
      trace,
    });

    // game might have been deleted / board failed
    if (!ctx.games?.[gameId] || !boardData) {
      ctx.broadcast(gameId, {
        type: "create-board-failed",
        message: "Board data was empty.",
      });
      ctx.safeAbortGeneration(game);
      return;
    }

    // If lobby flipped during generation, just abort cleanly
    if (!game.inLobby) {
      ctx.safeAbortGeneration(game);
      return;
    }

    ctx.applyNewGameState({ game, boardData, timeToBuzz, timeToAnswer });

    void (async () => {
      try {
        await ctx.ensureAiHostValueTts({ ctx, game, trace });
        const ids = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];

        ctx.broadcastPreloadBatch({
          ctx,
          gameId,
          game,
          imageAssetIds: [],
          ttsAssetIds: ids,
          final: false,
          trace,
          reason: "ai-host-bank-values",
        });
      } catch (e) {
        console.error("[create-game] ai host tts bank failed:", e);
        game.aiHostTts = {
          slotAssets: {},
          nameAssetsByPlayer: {},
          allAssetIds: [],
          categoryAssetsByCategory: {},
          valueAssetsByValue: {},
        };
      }
    })();

    // --- AI authority bootstrapping (selector + welcome audio) ---
    // Pick a starting selector (random online player; fallback to first player)
    const online = (game.players ?? []).filter((p) => p?.online !== false);
    const pool = online.length > 0 ? online : (game.players ?? []);
    const pick = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

    if (pick) {
      game.selectorKey = pick.username;
      game.selectorName = pick.displayname;
    } else {
      game.selectorKey = null;
      game.selectorName = null;
    }

    // Phase will be set when preload finishes (in preload-done)
    game.phase = null;
    game.welcomeEndsAt = null;
    if (game.welcomeTimer) {
      clearTimeout(game.welcomeTimer);
      game.welcomeTimer = null;
    }

    trace.mark("broadcast_game_state_start");

    // Preload workflow
    await ctx.setupPreloadHandshake({ ctx, gameId, game, boardData, trace });

    // IMPORTANT: do NOT flip inLobby yet and do NOT broadcast start-game yet.
    // We wait until everyone acks.
    trace.mark("broadcast_game_state_end");
    trace.end({ success: true });
  },

  "preload-done": async ({ ws, data, ctx }) => {
    const { gameId, username, token, playerKey } = data ?? {};
    if (!gameId || !ctx.games?.[gameId]) return;

    const game = ctx.games[gameId];
    if (!game.preload) return;

    // Username-only identity (normalize)
    // Back-compat: if some old client still sends playerKey, accept it as a stable id,
    // but prefer username going forward.
    const stableRaw = String(username ?? "").trim();

    const stable = stableRaw.toLowerCase();
    if (!stable) return; // don't allow "" keys

    const tok = Number(token);
    const finalToken = Number(game.preload.finalToken) || 0;

    // Back-compat: if older clients don't send token, treat it as ack for latest final token
    game.preload.acksByPlayer ||= {};
    game.preload.acksByPlayer[stable] = Number.isFinite(tok) ? tok : finalToken;

    // Can't finish until final batch has been broadcast
    if (!finalToken) return;

    // ✅ Freeze required set for THIS preload token to avoid "new online player blocks forever"
    // If missing (older state), initialize it once from current online players.
    if (
      !Array.isArray(game.preload.requiredForToken) ||
      game.preload.requiredForToken.length === 0
    ) {
      game.preload.requiredForToken = (game.players ?? [])
        .filter((p) => p.online)
        .map((p) =>
          String(ctx.playerStableId(p) ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
    }

    // Optional: if someone acks and isn't in requiredForToken (e.g., reconnect), don't let them block.
    // We only wait on requiredForToken.
    const required = game.preload.requiredForToken;

    const allDone = required.every((id) => game.preload.acksByPlayer?.[id] === finalToken);
    if (!allDone) return;

    // Phase 2: everyone is ready → start game
    game.preload.active = false;

    // Flip lobby state now
    game.inLobby = false;
    game.isLoading = false;
    if (!game.lobbyHost) game.lobbyHost = game.host;
    game.host = "AI Jeopardy";

    ctx.broadcast(gameId, {
      type: "start-game",
      host: game.host,
    });

    // Now that we're transitioning phases, expected acks should reflect who is online NOW.
    const requiredNow = (game.players ?? [])
      .filter((p) => p.online)
      .map((p) =>
        String(ctx.playerStableId(p) ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    game.gameReady = {
      expected: Object.fromEntries(requiredNow.map((id) => [id, true])),
      acks: {},
      done: false,
    };

    game.phase = null;

    ctx.broadcast(gameId, {
      type: "phase-changed",
      phase: game.phase,
      selectorKey: game.selectorKey ?? null,
      selectorName: game.selectorName ?? null,
    });
  },

  "game-ready": async ({ ws, data, ctx }) => {
    const { gameId, username } = data ?? {};
    if (!gameId || !ctx.games?.[gameId]) return;

    const game = ctx.games[gameId];

    // If we never set up the barrier (or already done), ignore
    if (!game.gameReady || game.gameReady.done) return;

    // New canonical stable id: username
    const stable = String(username ?? "")
      .trim()
      .toLowerCase();
    if (!stable) return;

    // Only count players we were expecting (don’t let random clients unblock)
    if (!game.gameReady.expected?.[stable]) return;

    game.gameReady.acks[stable] = true;

    const expectedIds = Object.keys(game.gameReady.expected);
    const allReady = expectedIds.every((id) => game.gameReady.acks[id]);
    if (!allReady) return;

    game.gameReady.done = true;

    // NOW fire welcome logic (moved from preload-done)
    const selectorName = String(game.selectorName ?? "").trim();

    console.log(selectorName);

    if (selectorName) {
      for (const player of game.players) {
        ctx.fireAndForget(
          ctx.repos.profiles.incrementGamesPlayed(player.username),
          "update games played",
        );
      }

      game.phase = "welcome";
      game.welcomeEndsAt = null;

      ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "welcome",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
      });

      void (async () => {
        const pad = 25;

        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
          { slot: "welcome_intro", pad },
          { slot: selectorName, pad },
          { slot: "welcome_outro" },
        ]);

        if (game.welcomeTimer) {
          clearTimeout(game.welcomeTimer);
          game.welcomeTimer = null;
        }

        game.welcomeTimer = setTimeout(() => {
          const g = ctx.games?.[gameId];
          if (!g) return;
          if (g.phase !== "welcome") return;

          g.phase = "board";
          g.welcomeTimer = null;

          ctx.broadcast(gameId, {
            type: "phase-changed",
            phase: "board",
            selectorKey: g.selectorKey ?? null,
            selectorName: g.selectorName ?? null,
          });
        }, 600);
      })();
    } else {
      game.phase = "board";
      game.welcomeEndsAt = null;

      ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
      });
    }
  },

  "create-lobby": async ({ ws, data, ctx }) => {
    const startedAt = Date.now();
    const reqId = `${startedAt}-${Math.random().toString(16).slice(2, 6)}`;

    const sendTimed = (type, payloadObj) => {
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

    const { username, displayname, playerKey, categories } = data ?? {};

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

    // game id generation
    let newGameId;
    do {
      newGameId = Math.random().toString(36).substr(2, 5).toUpperCase();
    } while (ctx.games[newGameId]);

    ws.gameId = newGameId;

    ctx.games[newGameId] = {
      host: u, // IMPORTANT: host should be username
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

    // IMPORTANT: include players because your client expects it in lobby-created
    sendTimed("lobby-created", {
      type: "lobby-created",
      gameId: newGameId,
      categories: ctx.games[newGameId].categories,
      players: ctx.games[newGameId].players.map((p) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: u,
    });

    sendTimed("lobby-state", ctx.buildLobbyState(newGameId, ws));

    const total = Date.now() - startedAt;
    if (total > 1000)
      console.warn(`[create-lobby][${reqId}] TOTAL SLOW`, { totalMs: total, gameId: newGameId });
  },

  "join-lobby": async ({ ws, data, ctx }) => {
    const { gameId, username, displayname, playerKey } = data ?? {};

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

    // 1) Reconnect by playerKey when available
    const existingByKey = stableKey
      ? game.players.find((p) => p.playerKey && p.playerKey === stableKey)
      : null;

    // 2) Fallback reconnect by username
    const existingByUsername = game.players.find(
      (p) =>
        String(p.username ?? "")
          .trim()
          .toLowerCase() === u,
    );

    const attachSocket = (player) => {
      player.id = ws.id;
      player.online = true;
      player.username = u; // server-authoritative identity
      player.displayname = dn; // presentation
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
      // NEW PLAYER (but still protect against race)
      const race = stableKey
        ? game.players.find((p) => p.playerKey === stableKey)
        : game.players.find(
            (p) =>
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

    // Send authoritative snapshot to the joining socket
    ws.send(JSON.stringify(ctx.buildLobbyState(gameId, ws)));

    // Broadcast a minimal list (UI will fetch cosmetics by username)
    ctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host, // IMPORTANT: host should be a username going forward
    });
  },

  "leave-lobby": async ({ ws, data, ctx }) => {
    const { gameId, playerKey, username } = data ?? {};

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

    game.players = game.players.filter((p) => {
      const pid = ctx.playerStableId(p); // must match your stable-id logic
      return pid !== stable;
    });

    if (game.players.length === before) return;

    // If host left, reassign host (or cleanup if empty)
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
      players: game.players.map((p) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host,
    });

    ctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
  },

  "update-lobby-settings": async ({ ws, data, ctx }) => {
    try {
      const { gameId, patch } = data ?? {};
      if (!gameId) {
        ws.send(JSON.stringify({ type: "error", message: "update-lobby-settings missing gameId" }));
        return;
      }

      const game = ctx.games?.[gameId];
      if (!game) {
        ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
        return;
      }

      // Host-only (prevents spoofing)
      if (!ctx.isHostSocket(game, ws)) {
        ws.send(
          JSON.stringify({ type: "error", message: "Only the host can update lobby settings." }),
        );
        return;
      }

      if (!game.lobbySettings) {
        game.lobbySettings = {
          timeToBuzz: 10,
          timeToAnswer: 10,
          selectedModel: ctx.appConfig.ai.defaultModel,
          reasoningEffort: "off",
          visualMode: "off",
          narrationEnabled: true,
          boardJson: "",
        };
      }

      const p = typeof patch === "object" && patch !== null ? patch : {};

      // Validate + apply
      if (typeof p.timeToBuzz === "number" && Number.isFinite(p.timeToBuzz)) {
        game.lobbySettings.timeToBuzz = Math.max(1, Math.min(60, Math.floor(p.timeToBuzz)));
      }
      if (typeof p.timeToAnswer === "number" && Number.isFinite(p.timeToAnswer)) {
        game.lobbySettings.timeToAnswer = Math.max(1, Math.min(60, Math.floor(p.timeToAnswer)));
      }

      if (typeof p.selectedModel === "string" && p.selectedModel.trim()) {
        game.lobbySettings.selectedModel = p.selectedModel.trim();
      }

      if (
        p.reasoningEffort === "off" ||
        p.reasoningEffort === "low" ||
        p.reasoningEffort === "medium" ||
        p.reasoningEffort === "high"
      ) {
        game.lobbySettings.reasoningEffort = p.reasoningEffort;
      }

      if (p.visualMode === "off" || p.visualMode === "commons" || p.visualMode === "brave") {
        game.lobbySettings.visualMode = p.visualMode;
      }

      if (typeof p.boardJson === "string") {
        game.lobbySettings.boardJson = p.boardJson;
      }

      if (typeof p.narrationEnabled === "boolean") {
        game.lobbySettings.narrationEnabled = p.narrationEnabled;
      }

      // Broadcast authoritative update to everyone
      ctx.broadcast(gameId, {
        type: "lobby-settings-updated",
        gameId,
        lobbySettings: game.lobbySettings,
      });
    } catch (e) {
      console.error("update-lobby-settings failed:", e);
      ws.send(JSON.stringify({ type: "error", message: "update-lobby-settings failed" }));
    }
  },

  "check-lobby": async ({ ws, data, ctx }) => {
    const { gameId } = data;

    let isValid = false;
    if (ctx.games[gameId] && ctx.games[gameId].inLobby === true) {
      isValid = true;
    }

    ws.send(JSON.stringify({ type: "check-lobby-response", isValid, gameId }));
  },

  "promote-host": async ({ ws, data, ctx }) => {
    const { gameId, targetUsername } = data ?? {};
    const game = ctx.games?.[gameId];
    if (!game || !game.inLobby) return;
    if (!ctx.requireHost(game, ws)) return;

    const targetU = String(targetUsername ?? "")
      .trim()
      .toLowerCase();
    if (!targetU) return;

    const targetPlayer = (game.players || []).find(
      (p) =>
        String(p.username ?? "")
          .trim()
          .toLowerCase() === targetU,
    );
    if (!targetPlayer) return;

    if (game.host === targetU) return;

    game.host = targetU;

    ctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host,
    });
  },

  "toggle-lock-category": async ({ ws, data, ctx }) => {
    const { gameId, boardType, index } = data;
    const game = ctx.games[gameId];
    if (!game) return;

    if (!ctx.isHostSocket(game, ws)) {
      ws.send(
        JSON.stringify({ type: "error", message: "Only the host can toggle category locks." }),
      );
      ctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    const bt = boardType;
    if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") return;

    const idx = Number(index);
    if (!Number.isFinite(idx)) return;
    if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) return;
    if (bt === "finalJeopardy" && idx !== 0) return;

    if (!game.lockedCategories) {
      game.lockedCategories = {
        firstBoard: Array(5).fill(false),
        secondBoard: Array(5).fill(false),
        finalJeopardy: Array(1).fill(false),
      };
    }

    const nextLocked = !Boolean(game.lockedCategories[bt][idx]);
    game.lockedCategories[bt][idx] = nextLocked;

    ctx.broadcast(gameId, {
      type: "category-lock-updated",
      boardType: bt,
      index: idx,
      locked: nextLocked,
    });
  },

  "randomize-category": async ({ ws, data, ctx }) => {
    const { gameId, boardType, index, candidates } = data;
    const game = ctx.games[gameId];
    if (!game) return;

    // Anyone may request randomize, but server enforces locks + uniqueness.
    const bt = boardType;
    if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") return;

    const idx = bt === "finalJeopardy" ? 0 : Number(index);
    if (!Number.isFinite(idx)) return;
    if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) return;

    // Lock enforcement
    if ((bt === "firstBoard" || bt === "secondBoard") && game.lockedCategories?.[bt]?.[idx]) {
      ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
      ctx.sendLobbySnapshot(ws, gameId);
      return;
    }
    if (bt === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) {
      ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
      ctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    game.categories = ctx.normalizeCategories11(game.categories);

    let globalIndex = -1;
    if (bt === "firstBoard") globalIndex = idx;
    else if (bt === "secondBoard") globalIndex = 5 + idx;
    else globalIndex = 10;

    const norm = (s) =>
      String(s ?? "")
        .trim()
        .toLowerCase();
    const used = new Set(
      game.categories.map((c, i) => (i === globalIndex ? "" : norm(c))).filter((v) => v.length > 0),
    );

    const list = Array.isArray(candidates) ? candidates : [];
    let chosen = "";

    for (const c of list) {
      const v = norm(c);
      if (!v) continue;
      if (used.has(v)) continue;
      chosen = String(c ?? "").trim();
      break;
    }

    if (!chosen) {
      ws.send(JSON.stringify({ type: "error", message: "No unique random category available." }));
      ctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    game.categories[globalIndex] = chosen;

    ctx.broadcast(gameId, {
      type: "category-updated",
      boardType: bt,
      index: bt === "finalJeopardy" ? 0 : idx,
      value: chosen,
    });
  },

  "update-category": async ({ ws, data, ctx }) => {
    try {
      const { gameId, boardType, index, value } = data ?? {};

      if (!gameId) {
        ws.send(JSON.stringify({ type: "error", message: "update-category missing gameId" }));
        return;
      }

      const game = ctx.games?.[gameId];
      if (!game) {
        ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
        return;
      }

      const bt = boardType;
      if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") {
        ws.send(JSON.stringify({ type: "error", message: `Invalid boardType: ${String(bt)}` }));
        ctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      const idx = bt === "finalJeopardy" ? 0 : Number(index);
      if (!Number.isFinite(idx)) {
        ws.send(JSON.stringify({ type: "error", message: `Invalid index: ${String(index)}` }));
        ctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) {
        ws.send(JSON.stringify({ type: "error", message: `Index out of range for ${bt}.` }));
        ctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      // Enforce lock server-side
      if ((bt === "firstBoard" || bt === "secondBoard") && game.lockedCategories?.[bt]?.[idx]) {
        ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
        ctx.sendLobbySnapshot(ws, gameId);
        return;
      }
      if (bt === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) {
        ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
        ctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      // Map boardType/index -> global index in the flat 11 array
      const globalIndex = bt === "firstBoard" ? idx : bt === "secondBoard" ? 5 + idx : 10;

      if (!Array.isArray(game.categories) || globalIndex < 0 || globalIndex > 10) {
        ws.send(
          JSON.stringify({ type: "error", message: "Server error: invalid categories state." }),
        );
        ctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      // Keep user intent; only strip leading whitespace
      const nextVal = String(value ?? "").replace(/^\s+/, "");
      game.categories[globalIndex] = nextVal;

      // One short log line (optional)
      console.log("[update-category]", gameId, bt, idx, "->", nextVal.slice(0, 60));

      ctx.broadcast(gameId, {
        type: "category-updated",
        boardType: bt,
        index: bt === "finalJeopardy" ? 0 : idx,
        value: nextVal,
      });
    } catch (err) {
      console.error("[update-category] crash", err);
      ws.send(JSON.stringify({ type: "error", message: "Server error while updating category." }));
    }
  },

  "update-categories": async ({ ws, data, ctx }) => {
    const { gameId, categories } = data;
    const game = ctx.games[gameId];

    if (game) {
      const next = ctx.normalizeCategories11(categories);
      game.categories = next;

      ctx.broadcast(gameId, {
        type: "categories-updated",
        categories: next,
      });

      console.log(`[Server] Categories updated for game ${gameId}:`, next);
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Game ${gameId} not found while updating categories.`,
        }),
      );
    }
  },

  "request-lobby-state": async ({ ws, data, ctx }) => {
    const gameId = data.gameId;
    const snapshot = ctx.buildLobbyState(gameId, ws);
    if (!snapshot) {
      ws.send(JSON.stringify({ type: "error", message: "Lobby does not exist!" }));
      return;
    }
    ws.send(JSON.stringify(snapshot));
  },
};
