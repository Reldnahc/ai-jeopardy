import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_BACKEND_PORT || 3102);
const GAME_ID = "E2E01";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (_.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

const user = {
  id: "e2e-user-1",
  username: "e2ehost",
  displayname: "E2E Host",
  role: "player",
};

const profile = {
  ...user,
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

const players = [{ username: user.username, displayname: user.displayname, online: true }];

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
    categories: [
      {
        category: "History",
        values: [
          { value: 400, question: "DJ question 1", answer: "DJ answer 1" },
          { value: 800, question: "DJ question 2", answer: "DJ answer 2" },
          { value: 1200, question: "DJ question 3", answer: "DJ answer 3" },
          { value: 1600, question: "DJ question 4", answer: "DJ answer 4" },
          { value: 2000, question: "DJ question 5", answer: "DJ answer 5" },
        ],
      },
    ],
  },
  finalJeopardy: {
    categories: [
      {
        category: "Final",
        values: [{ value: 0, question: "Final question", answer: "Final answer" }],
      },
    ],
  },
};

let inLobby = true;
let selectedClue = boardData.firstBoard.categories[0].values[0];
const clearedClues = new Set();
const scores = { [user.username]: 0 };

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", (_req, res) => {
  res.json({ user });
});

app.post("/api/auth/login", (_req, res) => {
  res.json({ token: "e2e-token", user });
});

app.post("/api/auth/signup", (_req, res) => {
  res.json({ token: "e2e-token", user });
});

app.get("/api/profile/me", (_req, res) => {
  res.json({ profile });
});

app.get("/api/profile/batch", (req, res) => {
  const usernames = Array.isArray(req.query.u)
    ? req.query.u.map((u) => String(u || "").toLowerCase())
    : [String(req.query.u || "").toLowerCase()].filter(Boolean);
  const profiles = usernames.includes(user.username) ? [profile] : [];
  res.json({ profiles });
});

app.get("/api/profile/:username", (req, res) => {
  if (String(req.params.username || "").toLowerCase() === user.username) {
    res.json({ profile });
    return;
  }
  res.status(404).json({ error: "Profile not found" });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function gameStatePayload() {
  return {
    type: "game-state",
    players,
    host: user.username,
    boardData,
    scores,
    activeBoard: "firstBoard",
    selectedClue,
    clearedClues: Array.from(clearedClues),
    buzzerLocked: false,
    buzzResult: null,
    buzzResultDisplay: null,
    lobbySettings: { narrationEnabled: false },
    phase: "board",
    selectorKey: user.username,
    selectorName: user.displayname,
    boardSelectionLocked: false,
  };
}

function lobbyStatePayload() {
  return {
    type: "lobby-state",
    players,
    host: user.username,
    categories: flatCategories,
    inLobby,
    isLoading: false,
    generationProgress: null,
    lockedCategories: {
      firstBoard: [false, false, false, false, false],
      secondBoard: [false, false, false, false, false],
      finalJeopardy: [false],
    },
    you: { isHost: true, playerName: user.displayname, playerKey: "e2e-player-key" },
  };
}

wss.on("connection", (ws) => {
  clients.add(ws);
  const heartbeat = setInterval(() => {
    sendJson(ws, gameStatePayload());
  }, 1_000);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    switch (msg.type) {
      case "auth":
        return;
      case "request-time-sync":
        sendJson(ws, {
          type: "send-time-sync",
          clientSentAt: msg.clientSentAt,
          clientSentPerf: msg.clientSentPerf,
          serverNow: Date.now(),
        });
        return;
      case "check-cotd":
        sendJson(ws, {
          type: "category-of-the-day",
          cotd: { category: "E2E Category", description: "Playwright mock backend" },
        });
        return;
      case "create-lobby":
        inLobby = true;
        sendJson(ws, { type: "lobby-created", gameId: GAME_ID, players, categories: flatCategories });
        return;
      case "check-lobby":
        sendJson(ws, { type: "check-lobby-response", isValid: true, gameId: GAME_ID });
        return;
      case "join-lobby":
      case "request-lobby-state":
        sendJson(ws, { type: "player-list-update", players, host: user.username });
        sendJson(ws, lobbyStatePayload());
        return;
      case "create-game":
        inLobby = false;
        sendJson(ws, lobbyStatePayload());
        return;
      case "join-game":
      case "game-ready":
        sendJson(ws, gameStatePayload());
        if (!selectedClue) {
          selectedClue = boardData.firstBoard.categories[0].values[0];
          sendJson(ws, {
            type: "clue-selected",
            clue: selectedClue,
            clearedClues: Array.from(clearedClues),
          });
          sendJson(ws, { type: "buzzer-unlocked" });
        }
        return;
      case "clue-selected":
        selectedClue = msg.clue || null;
        sendJson(ws, { type: "clue-selected", clue: selectedClue, clearedClues: Array.from(clearedClues) });
        sendJson(ws, { type: "buzzer-unlocked" });
        return;
      case "buzz":
        sendJson(ws, { type: "buzz-result", username: user.username, displayname: user.displayname });
        scores[user.username] = Number(scores[user.username] || 0) + 200;
        sendJson(ws, { type: "update-score", username: user.username, score: scores[user.username] });
        if (selectedClue) {
          const clueId = `${selectedClue.value}-${selectedClue.question}`;
          clearedClues.add(clueId);
          sendJson(ws, { type: "clue-cleared", clueId });
          sendJson(ws, { type: "returned-to-board", boardSelectionLocked: false });
          selectedClue = null;
        }
        return;
      case "update-score": {
        const username = String(msg.username || "").toLowerCase();
        const delta = Number(msg.delta || 0);
        scores[username] = Number(scores[username] || 0) + delta;
        sendJson(ws, { type: "update-score", username, score: scores[username] });

        if (selectedClue) {
          const clueId = `${selectedClue.value}-${selectedClue.question}`;
          clearedClues.add(clueId);
          sendJson(ws, { type: "clue-cleared", clueId });
          sendJson(ws, { type: "returned-to-board", boardSelectionLocked: false });
          selectedClue = null;
        }
        return;
      }
      default:
        return;
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-backend] listening on http://localhost:${PORT}`);
});

const shutdown = () => {
  for (const ws of clients) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
