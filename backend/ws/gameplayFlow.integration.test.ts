import { afterEach, describe, expect, it, vi } from "vitest";
import { routeWsMessage } from "./router.js";
import type { GameState, SocketState } from "../types/runtime.js";

type WsWithMessages = SocketState & { messages: string[] };

function makeWs(id: string): WsWithMessages {
  const messages: string[] = [];
  return {
    id,
    gameId: null,
    auth: { isAuthed: false, userId: null, role: "default" },
    isAlive: true,
    send: vi.fn((raw: string) => {
      messages.push(String(raw));
    }),
    messages,
  } as unknown as WsWithMessages;
}

function parseTypes(calls: Array<unknown[]>): string[] {
  return calls
    .map((c) => c[1] as { type?: string })
    .map((payload) => String(payload?.type ?? ""));
}

function makeHarness(judgeVerdict: "correct" | "incorrect") {
  const games: Record<string, GameState> = {};
  const broadcast = vi.fn();
  const autoResolveAfterJudgement = vi.fn(async () => {});

  const ctx = {
    games,
    repos: {
      profiles: {
        getPublicProfileByUsername: vi.fn(async (username: string) => ({
          username,
          displayname: username,
          color: "bg-blue-500",
          text_color: "text-white",
        })),
        incrementCluesSelected: vi.fn(async () => {}),
        incrementTotalBuzzes: vi.fn(async () => {}),
        incrementTimesBuzzed: vi.fn(async () => {}),
      },
    },
    appConfig: { ai: { defaultModel: "gpt-4o-mini", defaultSttProvider: "openai" } },
    normalizeCategories11: (arr: unknown[]) => (Array.isArray(arr) && arr.length ? arr : Array(11).fill("C")),
    buildLobbyState: (gameId: string) => ({ type: "lobby-state", gameId }),
    cancelLobbyCleanup: vi.fn(),
    scheduleLobbyCleanupIfEmpty: vi.fn(),
    broadcast,
    playerStableId: (p: { username?: string }) => String(p?.username ?? "").trim().toLowerCase(),
    checkAllWagersSubmitted: vi.fn(),
    checkAllDrawingsSubmitted: vi.fn(),
    getPlayerForSocket: (game: GameState, ws: SocketState) => game.players?.find((p) => p.id === ws.id) ?? null,
    cancelAutoUnlock: vi.fn(),
    fireAndForget: (p: PromiseLike<unknown>) => {
      void p;
    },
    findCategoryForClue: () => "",
    computeDailyDoubleMaxWager: vi.fn(() => 1000),
    aiHostVoiceSequence: vi.fn(async (_ctx, _gameId, _game, steps: Array<{ after?: () => unknown }>) => {
      for (const step of steps) {
        if (typeof step.after === "function") await step.after();
      }
      return true;
    }),
    startDdWagerCapture: vi.fn(),
    doUnlockBuzzerAuthoritative: (_gameId: string, game: GameState) => {
      game.buzzerLocked = false;
      broadcast(_gameId, { type: "buzzer-unlocked" });
    },
    getTtsDurationMs: vi.fn(async () => 0),
    sleepAndCheckGame: vi.fn(async () => true),
    checkBoardTransition: vi.fn(),
    aiHostSayByKey: vi.fn(async () => {}),
    clearAnswerWindow: vi.fn(),
    startGameTimer: vi.fn(),
    startAnswerWindow: vi.fn(),
    parseClueValue: vi.fn((v: unknown) => Number(String(v ?? "").replace(/[^0-9]/g, "")) || 0),
    autoResolveAfterJudgement,
    transcribeAnswerAudio: vi.fn(async () => "A"),
    judgeClueAnswerFast: vi.fn(async () => ({ verdict: judgeVerdict })),
  } as unknown as Record<string, unknown>;

  return { ctx, games, broadcast, autoResolveAfterJudgement };
}

function makeFullHarness() {
  const games: Record<string, GameState> = {};
  const broadcast = vi.fn();
  const autoResolveAfterJudgement = vi.fn(async () => {});
  const startAnswerWindowCallbacks: Record<string, () => void> = {};

  const ctx = {
    games,
    repos: {
      profiles: {
        getPublicProfileByUsername: vi.fn(async (username: string) => ({
          id: username,
          username,
          displayname: username,
          color: "bg-blue-500",
          text_color: "text-white",
        })),
        getRoleById: vi.fn(async () => "default"),
        incrementCluesSelected: vi.fn(async () => {}),
        incrementTotalBuzzes: vi.fn(async () => {}),
        incrementTimesBuzzed: vi.fn(async () => {}),
        incrementGamesPlayed: vi.fn(async () => {}),
      },
    },
    appConfig: { ai: { defaultModel: "gpt-4o-mini", defaultSttProvider: "openai" } },
    normalizeCategories11: (arr: unknown[]) => (Array.isArray(arr) && arr.length ? arr : Array(11).fill("C")),
    buildLobbyState: (gameId: string) => ({ type: "lobby-state", gameId }),
    sendLobbySnapshot: vi.fn(),
    cancelLobbyCleanup: vi.fn(),
    scheduleLobbyCleanupIfEmpty: vi.fn(),
    broadcast,
    playerStableId: (p: { username?: string }) => String(p?.username ?? "").trim().toLowerCase(),
    checkAllWagersSubmitted: vi.fn(),
    checkAllDrawingsSubmitted: vi.fn(),
    getPlayerForSocket: (game: GameState, ws: SocketState) => game.players?.find((p) => p.id === ws.id) ?? null,
    cancelAutoUnlock: vi.fn(),
    fireAndForget: (p: PromiseLike<unknown>) => {
      void p;
    },
    findCategoryForClue: () => "",
    computeDailyDoubleMaxWager: vi.fn(() => 1000),
    aiHostVoiceSequence: vi.fn(async (_ctx, _gameId, _game, steps: Array<{ after?: () => unknown }>) => {
      for (const step of steps) {
        if (typeof step.after === "function") await step.after();
      }
      return true;
    }),
    startDdWagerCapture: vi.fn((gameId: string, game: GameState) => {
      game.phase = "DD_WAGER_CAPTURE";
      game.ddWagerSessionId = "dd-session";
      game.ddWagerDeadlineAt = Date.now() + 10000;
    }),
    clearDdWagerTimer: vi.fn(),
    repromptDdWager: vi.fn(async () => {}),
    parseDailyDoubleWager: vi.fn(async () => ({ wager: 500, reason: null })),
    finalizeDailyDoubleWagerAndStartClue: vi.fn(async () => {}),
    doUnlockBuzzerAuthoritative: (_gameId: string, game: GameState) => {
      game.buzzerLocked = false;
      broadcast(_gameId, { type: "buzzer-unlocked" });
    },
    getTtsDurationMs: vi.fn(async () => 0),
    sleepAndCheckGame: vi.fn(async () => true),
    checkBoardTransition: vi.fn(),
    aiHostSayByKey: vi.fn(async () => {}),
    clearAnswerWindow: vi.fn(),
    startGameTimer: vi.fn(),
    startAnswerWindow: vi.fn((gameId: string, _game: GameState, _broadcast: unknown, _ms: number, cb: () => void) => {
      startAnswerWindowCallbacks[gameId] = cb;
    }),
    parseClueValue: vi.fn((v: unknown) => Number(String(v ?? "").replace(/[^0-9]/g, "")) || 0),
    autoResolveAfterJudgement,
    transcribeAnswerAudio: vi.fn(async () => "A"),
    judgeClueAnswerFast: vi.fn(async () => ({ verdict: "correct" })),
    requireHost: (game: GameState | null | undefined, ws: SocketState) => {
      if (!game) return false;
      const hostPlayer = game.players?.find((p) => p.username === game.host);
      return Boolean(hostPlayer && hostPlayer.id === ws.id);
    },
    isHostSocket: (game: GameState | null | undefined, ws: SocketState) => {
      if (!game) return false;
      const hostPlayer = game.players?.find((p) => p.username === game.host);
      return Boolean(hostPlayer && hostPlayer.id === ws.id);
    },
    ensureTtsAsset: vi.fn(async () => ({ id: "asset-1" })),
    submitWager: vi.fn(),
    submitDrawing: vi.fn(async () => {}),
    submitWagerDrawing: vi.fn(async () => {}),
    // create-game deps
    createTrace: vi.fn(() => ({ mark: vi.fn(), end: vi.fn() })),
    getGameOrFail: ({ gameId }: { gameId?: string }) => (gameId ? games[gameId] : null),
    ensureHostOrFail: ({ ws, game }: { ws: SocketState; game: GameState }) => {
      const hostPlayer = game.players?.find((p) => p.username === game.host);
      return Boolean(hostPlayer && hostPlayer.id === ws.id);
    },
    ensureLobbySettings: (_ctx: unknown, game: GameState) => game.lobbySettings,
    normalizeRole: (ws: SocketState) => String(ws.auth?.role ?? "default"),
    resolveModelOrFail: vi.fn(() => true),
    resolveVisualPolicy: vi.fn(() => ({
      usingImportedBoard: false,
      effectiveIncludeVisuals: false,
      requestedProvider: "none",
      canUseBrave: false,
      effectiveImageProvider: "none",
    })),
    resetGenerationProgressAndNotify: vi.fn(),
    initPreloadState: vi.fn(),
    ensureAiHostTtsBank: vi.fn(async () => {}),
    getBoardDataOrFail: vi.fn(async () => ({
      firstBoard: { categories: [{ values: [{ value: 400, question: "Q", answer: "A" }] }] },
      secondBoard: { categories: [] },
      dailyDoubleClueKeys: { firstBoard: [], secondBoard: [], finalJeopardy: [] },
      ttsByClueKey: {},
      ttsByAnswerKey: {},
    })),
    safeAbortGeneration: vi.fn(),
    applyNewGameState: vi.fn(({ game, boardData, timeToBuzz, timeToAnswer }: Record<string, unknown>) => {
      const g = game as GameState;
      g.boardData = boardData as never;
      g.inLobby = true;
      g.timeToBuzz = Number(timeToBuzz ?? 10);
      g.timeToAnswer = Number(timeToAnswer ?? 10);
      g.players = g.players || [];
      g.scores = g.scores || {};
      g.clearedClues = g.clearedClues || new Set();
      g.activeBoard = "firstBoard";
      g.buzzLockouts = {};
      g.buzzerLocked = true;
      g.lobbySettings = g.lobbySettings || {
        timeToBuzz: 10,
        timeToAnswer: 10,
        selectedModel: "gpt-4o-mini",
        reasoningEffort: "off",
        visualMode: "off",
        narrationEnabled: true,
        boardJson: "",
      };
    }),
    ensureAiHostValueTts: vi.fn(async () => {}),
    broadcastPreloadBatch: vi.fn(),
    setupPreloadHandshake: vi.fn(async ({ game }: { game: GameState }) => {
      game.preload = {
        active: true,
        finalToken: 1,
        requiredForToken: (game.players || [])
          .map((p) => String(p.username || "").toLowerCase())
          .filter(Boolean),
        acksByPlayer: {},
      } as never;
      game.isLoading = true;
    }),
    verifyJwt: vi.fn(() => ({ sub: "u1", role: "admin" })),
    getCOTD: vi.fn(() => "Space"),
  } as unknown as Record<string, unknown>;

  return { ctx, games, broadcast, autoResolveAfterJudgement, startAnswerWindowCallbacks };
}

describe("ws gameplay integration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("plays one clue from lobby creation through answer resolution", async () => {
    vi.useFakeTimers();

    const { ctx, games, broadcast, autoResolveAfterJudgement } = makeHarness("correct");

    const host = makeWs("ws-host");
    const player = makeWs("ws-player");

    await routeWsMessage(
      host,
      JSON.stringify({ type: "create-lobby", username: "host", displayname: "Host" }),
      ctx as never,
    );

    const lobbyCreated = host.messages
      .map((m) => JSON.parse(m))
      .find((m: { type?: string }) => m.type === "lobby-created") as { gameId: string } | undefined;
    expect(lobbyCreated?.gameId).toBeTruthy();
    const gameId = String(lobbyCreated?.gameId);

    await routeWsMessage(
      player,
      JSON.stringify({ type: "join-lobby", gameId, username: "alice", displayname: "Alice" }),
      ctx as never,
    );

    const game = games[gameId];
    expect(game).toBeTruthy();
    game.inLobby = false;
    game.phase = "board";
    game.selectorKey = "host";
    game.selectorName = "Host";
    game.activeBoard = "firstBoard";
    game.boardData = {
      ...(game.boardData || {}),
      ttsByClueKey: { "firstBoard:400:Q": "asset-clue" },
      dailyDoubleClueKeys: { firstBoard: [], secondBoard: [], finalJeopardy: [] },
    } as never;
    game.clearedClues = new Set();
    game.buzzLockouts = {};
    game.buzzerLocked = false;

    await routeWsMessage(
      host,
      JSON.stringify({ type: "join-game", gameId, username: "host", displayname: "Host" }),
      ctx as never,
    );
    await routeWsMessage(
      player,
      JSON.stringify({ type: "join-game", gameId, username: "alice", displayname: "Alice" }),
      ctx as never,
    );

    await routeWsMessage(
      host,
      JSON.stringify({
        type: "clue-selected",
        gameId,
        clue: { value: 400, question: "Q", answer: "A", category: "Science" },
      }),
      ctx as never,
    );

    await routeWsMessage(player, JSON.stringify({ type: "buzz", gameId }), ctx as never);
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(0);

    expect(game.phase).toBe("ANSWER_CAPTURE");
    expect(typeof game.answerSessionId).toBe("string");

    await routeWsMessage(
      player,
      JSON.stringify({
        type: "answer-audio-blob",
        gameId,
        answerSessionId: game.answerSessionId,
        mimeType: "audio/webm",
        dataBase64: Buffer.from("abc").toString("base64"),
      }),
      ctx as never,
    );

    expect(game.phase).toBe("RESULT");
    expect(game.answerVerdict).toBe("correct");
    expect(autoResolveAfterJudgement).toHaveBeenCalledWith(
      ctx,
      gameId,
      game,
      "alice",
      "correct",
    );

    const emittedTypes = parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls);
    expect(emittedTypes).toContain("clue-selected");
    expect(emittedTypes).toContain("buzz-result");
    expect(emittedTypes).toContain("answer-capture-start");
    expect(emittedTypes).toContain("answer-result");
  });

  it("plays one clue through an incorrect verdict path", async () => {
    vi.useFakeTimers();
    const { ctx, games, broadcast, autoResolveAfterJudgement } = makeHarness("incorrect");
    const host = makeWs("ws-host");
    const player = makeWs("ws-player");

    await routeWsMessage(
      host,
      JSON.stringify({ type: "create-lobby", username: "host", displayname: "Host" }),
      ctx as never,
    );
    const gameId = String(
      host.messages
        .map((m) => JSON.parse(m))
        .find((m: { type?: string }) => m.type === "lobby-created")?.gameId,
    );

    await routeWsMessage(
      player,
      JSON.stringify({ type: "join-lobby", gameId, username: "alice", displayname: "Alice" }),
      ctx as never,
    );

    const game = games[gameId];
    game.inLobby = false;
    game.phase = "board";
    game.selectorKey = "host";
    game.selectorName = "Host";
    game.activeBoard = "firstBoard";
    game.boardData = {
      ...(game.boardData || {}),
      ttsByClueKey: { "firstBoard:400:Q": "asset-clue" },
      dailyDoubleClueKeys: { firstBoard: [], secondBoard: [], finalJeopardy: [] },
    } as never;
    game.clearedClues = new Set();
    game.buzzLockouts = {};
    game.buzzerLocked = false;

    await routeWsMessage(
      host,
      JSON.stringify({ type: "join-game", gameId, username: "host", displayname: "Host" }),
      ctx as never,
    );
    await routeWsMessage(
      player,
      JSON.stringify({ type: "join-game", gameId, username: "alice", displayname: "Alice" }),
      ctx as never,
    );
    await routeWsMessage(
      host,
      JSON.stringify({
        type: "clue-selected",
        gameId,
        clue: { value: 400, question: "Q", answer: "A", category: "Science" },
      }),
      ctx as never,
    );
    await routeWsMessage(player, JSON.stringify({ type: "buzz", gameId }), ctx as never);
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(0);

    await routeWsMessage(
      player,
      JSON.stringify({
        type: "answer-audio-blob",
        gameId,
        answerSessionId: game.answerSessionId,
        mimeType: "audio/webm",
        dataBase64: Buffer.from("abc").toString("base64"),
      }),
      ctx as never,
    );

    expect(game.phase).toBe("RESULT");
    expect(game.answerVerdict).toBe("incorrect");
    expect(autoResolveAfterJudgement).toHaveBeenCalledWith(
      ctx,
      gameId,
      game,
      "alice",
      "incorrect",
    );
    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).toContain("answer-result");
  });

  it("daily double wager path reprompts on unparsable audio then finalizes on valid parse", async () => {
    const { ctx, games } = makeFullHarness();
    const ws = makeWs("ws-dd");
    games.g1 = {
      phase: "DD_WAGER_CAPTURE",
      ddWagerSessionId: "dd-1",
      lobbySettings: { sttProviderName: "openai" },
      players: [{ id: "ws-dd", username: "alice", displayname: "Alice" }],
      dailyDouble: { playerUsername: "alice", playerDisplayname: "Alice", maxWager: 1000, clueKey: "k1" },
      usedDailyDoubles: new Set(),
    } as unknown as GameState;
    (ctx.parseDailyDoubleWager as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      wager: null,
      reason: "no-number",
    });

    await routeWsMessage(
      ws,
      JSON.stringify({
        type: "daily-double-wager-audio-blob",
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        mimeType: "audio/webm",
        dataBase64: Buffer.from("abc").toString("base64"),
      }),
      ctx as never,
    );
    expect(ctx.repromptDdWager).toHaveBeenCalled();

    (ctx.parseDailyDoubleWager as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      wager: 700,
      reason: null,
    });
    await routeWsMessage(
      ws,
      JSON.stringify({
        type: "daily-double-wager-audio-blob",
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        mimeType: "audio/webm",
        dataBase64: Buffer.from("abc").toString("base64"),
      }),
      ctx as never,
    );
    expect(ctx.finalizeDailyDoubleWagerAndStartClue).toHaveBeenCalledWith(
      "g1",
      games.g1,
      ctx,
      expect.objectContaining({ wager: 700 }),
    );
  });

  it("final jeopardy submission handlers pass through to ctx submit functions", async () => {
    const { ctx, games } = makeFullHarness();
    const ws = makeWs("ws-fj");
    games.g1 = {} as GameState;

    await routeWsMessage(ws, JSON.stringify({ type: "submit-wager", gameId: "g1", player: "alice", wager: 500 }), ctx as never);
    await routeWsMessage(ws, JSON.stringify({ type: "submit-drawing", gameId: "g1", player: "alice", drawing: "img" }), ctx as never);
    await routeWsMessage(
      ws,
      JSON.stringify({ type: "submit-final-wager-drawing", gameId: "g1", player: "alice", drawing: "img2" }),
      ctx as never,
    );

    expect(ctx.submitWager).toHaveBeenCalled();
    expect(ctx.submitDrawing).toHaveBeenCalled();
    expect(ctx.submitWagerDrawing).toHaveBeenCalled();
  });

  it("enforces host permissions for lobby/game control actions", async () => {
    const { ctx, games, broadcast } = makeFullHarness();
    const host = makeWs("ws-host");
    const other = makeWs("ws-other");
    games.g1 = {
      host: "host",
      players: [
        { id: "ws-host", username: "host", displayname: "Host", online: true },
        { id: "ws-other", username: "alice", displayname: "Alice", online: true },
      ],
      inLobby: true,
      lobbySettings: { timeToBuzz: 10, timeToAnswer: 10, selectedModel: "gpt-4o-mini", reasoningEffort: "off", visualMode: "off", narrationEnabled: true, boardJson: "" },
    } as unknown as GameState;

    await routeWsMessage(
      other,
      JSON.stringify({ type: "update-lobby-settings", gameId: "g1", patch: { timeToBuzz: 12 } }),
      ctx as never,
    );
    expect(other.messages.some((m) => m.includes("Only the host can update lobby settings"))).toBe(true);

    await routeWsMessage(other, JSON.stringify({ type: "unlock-buzzer", gameId: "g1" }), ctx as never);
    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("buzzer-unlocked");

    await routeWsMessage(host, JSON.stringify({ type: "unlock-buzzer", gameId: "g1" }), ctx as never);
    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).toContain("buzzer-unlocked");
  });

  it("reconnects player to existing in-progress game and preserves session fields", async () => {
    const { ctx, games } = makeFullHarness();
    const ws = makeWs("ws-new");
    games.g1 = {
      host: "host",
      players: [{ id: "ws-old", username: "alice", displayname: "Alice", online: false }],
      answerSessionId: "ans-1",
      answerClueKey: "k1",
      phase: "ANSWER_CAPTURE",
      selectedClue: { value: 400, question: "Q", answer: "A" },
      activeBoard: "firstBoard",
      clearedClues: new Set(),
      scores: {},
      buzzLockouts: {},
    } as unknown as GameState;

    await routeWsMessage(
      ws,
      JSON.stringify({ type: "join-game", gameId: "g1", username: "alice", displayname: "Alice" }),
      ctx as never,
    );
    expect(games.g1.players?.[0]?.id).toBe("ws-new");
    const sent = ws.messages.map((m) => JSON.parse(m)).find((m) => m.type === "game-state");
    expect(sent?.answerSessionId).toBe("ans-1");
    expect(sent?.phase).toBe("ANSWER_CAPTURE");
  });

  it("gates game start on preload-done and game-ready acknowledgements", async () => {
    vi.useFakeTimers();
    const { ctx, games, broadcast } = makeFullHarness();
    const host = makeWs("ws-host");
    const p2 = makeWs("ws-p2");
    games.g1 = {
      host: "host",
      inLobby: true,
      players: [
        { id: "ws-host", username: "host", displayname: "Host", online: true },
        { id: "ws-p2", username: "alice", displayname: "Alice", online: true },
      ],
      lobbySettings: { timeToBuzz: 10, timeToAnswer: 10, selectedModel: "gpt-4o-mini", reasoningEffort: "off", visualMode: "off", narrationEnabled: true, boardJson: "" },
      categories: ["A"],
      scores: { host: 0, alice: 0 },
      clearedClues: new Set(),
      buzzLockouts: {},
    } as unknown as GameState;

    await routeWsMessage(host, JSON.stringify({ type: "create-game", gameId: "g1" }), ctx as never);
    expect(games.g1.preload?.active).toBe(true);

    await routeWsMessage(host, JSON.stringify({ type: "preload-done", gameId: "g1", username: "host", token: 1 }), ctx as never);
    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("start-game");
    await routeWsMessage(p2, JSON.stringify({ type: "preload-done", gameId: "g1", username: "alice", token: 1 }), ctx as never);
    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).toContain("start-game");

    await routeWsMessage(host, JSON.stringify({ type: "game-ready", gameId: "g1", username: "host" }), ctx as never);
    expect(games.g1.phase).toBeNull();
    await routeWsMessage(p2, JSON.stringify({ type: "game-ready", gameId: "g1", username: "alice" }), ctx as never);
    expect(games.g1.phase).toBe("welcome");
    await vi.advanceTimersByTimeAsync(650);
    expect(games.g1.phase).toBe("board");
  });

  it("applies fair buzz race ordering and picks earliest timestamp winner", async () => {
    vi.useFakeTimers();
    const { ctx, games, broadcast } = makeFullHarness();
    const a = makeWs("ws-a");
    const b = makeWs("ws-b");
    const now = Date.now();
    games.g1 = {
      players: [
        { id: "ws-a", username: "alice", displayname: "Alice" },
        { id: "ws-b", username: "bob", displayname: "Bob" },
      ],
      selectedClue: { value: 400, question: "Q", answer: "A" },
      activeBoard: "firstBoard",
      phase: "clue",
      clueState: { clueKey: "k1", lockedOut: {}, buzzOpenAtMs: now - 5 },
      buzzLockouts: {},
      buzzerLocked: false,
      scores: { alice: 0, bob: 0 },
    } as unknown as GameState;

    await routeWsMessage(a, JSON.stringify({ type: "buzz", gameId: "g1", estimatedServerBuzzAtMs: now + 10 }), ctx as never);
    await routeWsMessage(b, JSON.stringify({ type: "buzz", gameId: "g1", estimatedServerBuzzAtMs: now + 2 }), ctx as never);
    await vi.advanceTimersByTimeAsync(60);
    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).toContain("buzz-result");
    expect(games.g1.buzzed).toBe("bob");
  });

  it("answer window timeout auto-resolves incorrect when no audio is submitted", async () => {
    vi.useFakeTimers();
    const { ctx, games, broadcast, autoResolveAfterJudgement, startAnswerWindowCallbacks } = makeFullHarness();
    const a = makeWs("ws-a");
    games.g1 = {
      players: [{ id: "ws-a", username: "alice", displayname: "Alice" }],
      selectedClue: { value: 400, question: "Q", answer: "A" },
      activeBoard: "firstBoard",
      phase: "clue",
      clueState: { clueKey: "k1", lockedOut: {}, buzzOpenAtMs: Date.now() - 5 },
      buzzLockouts: {},
      buzzerLocked: false,
      scores: { alice: 0 },
    } as unknown as GameState;

    await routeWsMessage(a, JSON.stringify({ type: "buzz", gameId: "g1" }), ctx as never);
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(0);
    const cb = startAnswerWindowCallbacks.g1;
    expect(typeof cb).toBe("function");
    cb?.();

    expect(parseTypes((broadcast as ReturnType<typeof vi.fn>).mock.calls)).toContain("answer-result");
    expect(autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", games.g1, "alice", "incorrect");
  });

  it("board progression integration: mark-all-complete clears and triggers transition check", async () => {
    const { ctx, games } = makeFullHarness();
    const ws = makeWs("ws-h");
    games.g1 = {
      activeBoard: "firstBoard",
      clearedClues: new Set(),
      boardData: {
        firstBoard: { categories: [{ values: [{ value: 200, question: "Q1" }, { value: 400, question: "Q2" }] }] },
      },
    } as unknown as GameState;

    await routeWsMessage(ws, JSON.stringify({ type: "mark-all-complete", gameId: "g1" }), ctx as never);
    expect(games.g1.clearedClues?.has("200-Q1")).toBe(true);
    expect(games.g1.clearedClues?.has("400-Q2")).toBe(true);
    expect(ctx.checkBoardTransition).toHaveBeenCalled();
  });

  it("auth integration uses JWT payload then DB role override", async () => {
    const { ctx } = makeFullHarness();
    const ws = makeWs("ws-auth");
    (ctx.verifyJwt as ReturnType<typeof vi.fn>).mockReturnValue({ sub: "u1", role: "admin" });
    (ctx.repos as { profiles: { getRoleById: ReturnType<typeof vi.fn> } }).profiles.getRoleById.mockResolvedValue(
      "moderator",
    );

    await routeWsMessage(ws, JSON.stringify({ type: "auth", token: "good-token" }), ctx as never);
    const payload = ws.messages.map((m) => JSON.parse(m)).find((m) => m.type === "auth-result");
    expect(payload?.ok).toBe(true);
    expect(payload?.role).toBe("moderator");
  });

  it("lobby lifecycle integration schedules cleanup when empty and cancels on join", async () => {
    const { ctx, games } = makeFullHarness();
    const host = makeWs("ws-host");
    const joiner = makeWs("ws-join");
    games.g1 = {
      host: "host",
      inLobby: true,
      players: [{ id: "ws-host", username: "host", displayname: "Host", online: true }],
    } as unknown as GameState;

    await routeWsMessage(
      host,
      JSON.stringify({ type: "leave-lobby", gameId: "g1", username: "host" }),
      ctx as never,
    );
    expect(ctx.scheduleLobbyCleanupIfEmpty).toHaveBeenCalledWith("g1");

    await routeWsMessage(
      joiner,
      JSON.stringify({ type: "join-lobby", gameId: "g1", username: "alice", displayname: "Alice" }),
      ctx as never,
    );
    expect(ctx.cancelLobbyCleanup).toHaveBeenCalled();
  });
});
