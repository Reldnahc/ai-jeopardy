import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_BACKEND_PORT || 3102);
const GAME_ID = "E2E01";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

const boardData = {
  firstBoard: {
    categories: [
      {
        category: "Science",
        values: [
          { value: 200, question: "E2E clue question", answer: "E2E clue answer" },
          { value: 400, question: "Second question", answer: "Second answer" },
          { value: 600, question: "Third question", answer: "Third answer" },
          { value: 800, question: "Fourth question", answer: "Fourth answer" },
          { value: 1000, question: "Fifth question", answer: "Fifth answer" },
        ],
      },
    ],
  },
  secondBoard: {
    categories: [{ category: "History", values: [] }],
  },
  finalJeopardy: {
    categories: [{ category: "Final", values: [{ value: 0, question: "Final Q", answer: "Final A" }] }],
  },
};

const flatCategories = [
  "Science",
  "History",
  "Movies",
  "Sports",
  "Music",
  "Geography",
  "Animals",
  "Math",
  "Food",
  "Art",
  "Final",
];

const usersByToken = new Map();
const profilesByUsername = new Map();

const state = {
  inLobby: true,
  hostUsername: null,
  players: [],
  scores: {},
  selectedClue: null,
  clearedClues: new Set(),
  buzzResult: null,
};

const sockets = new Set();
const socketMeta = new WeakMap();

function norm(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function ensureUser({ username, displayname }) {
  const u = norm(username);
  if (!u) return null;
  const d = String(displayname || username || "").trim() || u;
  const existing = profilesByUsername.get(u);
  if (existing) return existing;
  const user = {
    id: `e2e-${u}`,
    username: u,
    displayname: d,
    role: "admin",
    color: null,
    text_color: null,
    name_color: null,
    border: null,
    border_color: null,
    background: null,
    background_color: null,
    font: null,
    icon: null,
  };
  profilesByUsername.set(u, user);
  return user;
}

function authUserFromReq(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return null;
  return usersByToken.get(auth.slice("Bearer ".length)) || null;
}

function buildLobbyState(forUsername) {
  return {
    type: "lobby-state",
    players: state.players,
    host: state.hostUsername,
    categories: flatCategories,
    inLobby: state.inLobby,
    generationProgress: null,
    lockedCategories: {
      firstBoard: [false, false, false, false, false],
      secondBoard: [false, false, false, false, false],
      finalJeopardy: [false],
    },
    you: {
      isHost: norm(forUsername) === norm(state.hostUsername),
      playerName:
        state.players.find((p) => norm(p.username) === norm(forUsername))?.displayname ?? forUsername ?? "",
      playerKey: `pk-${norm(forUsername) || "guest"}`,
    },
  };
}

function buildGameState() {
  return {
    type: "game-state",
    players: state.players,
    host: state.hostUsername,
    boardData,
    scores: state.scores,
    activeBoard: "firstBoard",
    selectedClue: state.selectedClue,
    clearedClues: Array.from(state.clearedClues),
    buzzerLocked: !state.selectedClue,
    buzzResult: state.buzzResult?.username ?? null,
    buzzResultDisplay: state.buzzResult?.displayname ?? null,
    lobbySettings: { narrationEnabled: false },
    phase: "board",
    selectorKey: state.hostUsername,
    selectorName:
      state.players.find((p) => norm(p.username) === norm(state.hostUsername))?.displayname ?? state.hostUsername,
    boardSelectionLocked: false,
  };
}

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload) {
  for (const ws of sockets) sendJson(ws, payload);
}

function broadcastPlayerList() {
  broadcast({ type: "player-list-update", players: state.players, host: state.hostUsername });
}

function resetState() {
  state.inLobby = true;
  state.hostUsername = null;
  state.players = [];
  state.scores = {};
  state.selectedClue = null;
  state.clearedClues = new Set();
  state.buzzResult = null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/test/reset", (_req, res) => {
  resetState();
  res.json({ ok: true });
});

app.get("/test/state", (_req, res) => {
  res.json({
    hostUsername: state.hostUsername,
    players: state.players,
    scores: state.scores,
    selectedClue: state.selectedClue,
    clearedClues: Array.from(state.clearedClues),
  });
});

app.post("/api/auth/signup", (req, res) => {
  const user = ensureUser({
    username: req.body?.username,
    displayname: req.body?.displayname || req.body?.username,
  });
  if (!user) return res.status(400).json({ error: "Invalid username" });
  const token = `token-${user.username}`;
  usersByToken.set(token, user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayname: user.displayname,
      role: user.role,
    },
  });
});

app.post("/api/auth/login", (req, res) => {
  const user = ensureUser({
    username: req.body?.username,
    displayname: req.body?.username,
  });
  if (!user) return res.status(400).json({ error: "Invalid username" });
  const token = `token-${user.username}`;
  usersByToken.set(token, user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayname: user.displayname,
      role: user.role,
    },
  });
});

app.get("/api/auth/me", (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayname: user.displayname,
      role: user.role,
    },
  });
});

app.get("/api/profile/me", (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  res.json({ profile: user });
});

app.get("/api/profile/batch", (req, res) => {
  const q = req.query.u;
  const usernames = Array.isArray(q) ? q.map(norm) : [norm(q)].filter(Boolean);
  const profiles = usernames.map((u) => profilesByUsername.get(u)).filter(Boolean);
  res.json({ profiles });
});

app.get("/api/profile/:username", (req, res) => {
  const user = profilesByUsername.get(norm(req.params.username));
  if (!user) return res.status(404).json({ error: "Profile not found" });
  res.json({ profile: user });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  sockets.add(ws);
  socketMeta.set(ws, { user: null });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    const meta = socketMeta.get(ws) || { user: null, username: null };

    switch (msg.type) {
      case "auth": {
        const token = String(msg.token || "");
        meta.user = usersByToken.get(token) || null;
        socketMeta.set(ws, meta);
        return;
      }
      case "request-time-sync":
        return sendJson(ws, {
          type: "send-time-sync",
          clientSentAt: msg.clientSentAt,
          clientSentPerf: msg.clientSentPerf,
          serverNow: Date.now(),
        });
      case "check-cotd":
        return sendJson(ws, {
          type: "category-of-the-day",
          cotd: { category: "E2E Category", description: "Playwright mock backend" },
        });
      case "create-lobby": {
        const creator = ensureUser({
          username: msg.username || meta.user?.username,
          displayname: msg.displayname || meta.user?.displayname,
        });
        if (!creator) return;
        meta.username = creator.username;
        socketMeta.set(ws, meta);
        state.inLobby = true;
        state.hostUsername = creator.username;
        state.players = [{ username: creator.username, displayname: creator.displayname, online: true }];
        state.scores = { [creator.username]: 0 };
        sendJson(ws, {
          type: "lobby-created",
          gameId: GAME_ID,
          players: state.players,
          categories: flatCategories,
        });
        broadcastPlayerList();
        return;
      }
      case "check-lobby":
        return sendJson(ws, { type: "check-lobby-response", isValid: true, gameId: GAME_ID });
      case "join-lobby": {
        const u = norm(msg.username || meta.user?.username);
        if (!u) return;
        meta.username = u;
        socketMeta.set(ws, meta);
        const profile = ensureUser({
          username: u,
          displayname: msg.displayname || profilesByUsername.get(u)?.displayname || u,
        });
        if (!profile) return;
        if (!state.players.some((p) => norm(p.username) === u)) {
          state.players.push({ username: profile.username, displayname: profile.displayname, online: true });
          state.scores[profile.username] = state.scores[profile.username] ?? 0;
        }
        broadcastPlayerList();
        return sendJson(ws, buildLobbyState(profile.username));
      }
      case "request-lobby-state":
        return sendJson(ws, buildLobbyState(meta.username || meta.user?.username || msg.username));
      case "create-game":
        state.inLobby = false;
        state.selectedClue = boardData.firstBoard.categories[0].values[0];
        state.buzzResult = null;
        for (const client of sockets) {
          const m = socketMeta.get(client) || { user: null };
          sendJson(client, buildLobbyState(m.user?.username || ""));
        }
        return;
      case "join-game":
        meta.username = norm(msg.username || meta.username || meta.user?.username || "");
        socketMeta.set(ws, meta);
        return sendJson(ws, buildGameState());
      case "game-ready":
        return sendJson(ws, buildGameState());
      case "clue-selected": {
        if (norm(meta.username || meta.user?.username) !== norm(state.hostUsername)) return;
        state.selectedClue = msg.clue || null;
        state.buzzResult = null;
        broadcast({
          type: "clue-selected",
          clue: state.selectedClue,
          clearedClues: Array.from(state.clearedClues),
        });
        broadcast({ type: "buzzer-unlocked" });
        return;
      }
      case "buzz": {
        if (!state.selectedClue || state.buzzResult) return;
        const username = norm(meta.username || meta.user?.username || "");
        const player = state.players.find((p) => norm(p.username) === username);
        if (!player) return;
        state.buzzResult = { username: player.username, displayname: player.displayname };
        broadcast({
          type: "buzz-result",
          username: player.username,
          displayname: player.displayname,
        });
        const clueValue = Number(state.selectedClue?.value || 0);
        state.scores[player.username] = Number(state.scores[player.username] || 0) + clueValue;
        broadcast({
          type: "update-score",
          username: player.username,
          score: state.scores[player.username],
        });
        const clueId = `${state.selectedClue.value}-${state.selectedClue.question}`;
        state.clearedClues.add(clueId);
        state.selectedClue = null;
        state.buzzResult = null;
        broadcast({ type: "clue-cleared", clueId });
        broadcast({ type: "returned-to-board", boardSelectionLocked: false });
        return;
      }
      case "update-score": {
        if (norm(meta.username || meta.user?.username) !== norm(state.hostUsername)) return;
        const username = norm(msg.username);
        const delta = Number(msg.delta || 0);
        state.scores[username] = Number(state.scores[username] || 0) + delta;
        broadcast({ type: "update-score", username, score: state.scores[username] });

        if (state.selectedClue) {
          const clueId = `${state.selectedClue.value}-${state.selectedClue.question}`;
          state.clearedClues.add(clueId);
          state.selectedClue = null;
          state.buzzResult = null;
          broadcast({ type: "clue-cleared", clueId });
          broadcast({ type: "returned-to-board", boardSelectionLocked: false });
        }
        return;
      }
      default:
        return;
    }
  });

  ws.on("close", () => {
    sockets.delete(ws);
    socketMeta.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-backend] listening on http://127.0.0.1:${PORT}`);
});

function shutdown() {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  wss.close(() => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

resetState();
