import { WebSocketServer } from 'ws';
import 'dotenv/config';
import { createBoardData, createCategoryOfTheDay } from './services/aiService.js';
import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import {PING_INTERVAL, WS_PORT} from "./config/websocket.js";
import {supabase} from "./config/database.js";
import {getColorFromPlayerName} from "./services/userService.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express(); // Initialize Express app
app.use(cors());
app.use(bodyParser.json());

const authenticateRequest = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send("Unauthorized");
    }

    const token = authHeader.split(" ")[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data) {
        return res.status(401).send("Unauthorized");
    }

    req.user = data; // Attach the user to the request object
    next();
};

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

server.listen(3002, () => {
    console.log("HTTP + WS listening on :3002");
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// SPA fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});

// Store game state
const games = {};

let cotd =
    {
    category: "",
    description: ""
    };


// Ensure array exists and is 11 long
const normalizeCategories11 = (arr) => {
    const next = Array.isArray(arr) ? arr.slice(0, 11) : [];
    while (next.length < 11) next.push("");
    return next;
};

wss.on('connection', (ws) => {
    ws.id = Math.random().toString(36).substr(2, 9); // Assign a unique ID to each socket
    console.log('New client connected');
    ws.isAlive = true; // Mark connection as alive when established

    ws.on('pong', () => {
        ws.isAlive = true; // Mark as healthy when a pong is received
    });

    ws.on('message', async (message) => {
        try {
            const text = typeof message === "string" ? message : message.toString("utf8");
            console.log("[Server] raw message:", text);
            const data = JSON.parse(text);
            console.log(`[Server] Received message from client ${ws.id}:`, data);
            if (data.type === 'create-game' || data.type === 'join-game' ||
                data.type === 'create-lobby' || data.type === 'join-lobby' ||
                data.type === 'check-lobby') {
                // Assign the game ID to the WebSocket instance
                ws.gameId = data.gameId;
            }
            if (data.type === 'kick-player') {
                const { gameId, targetPlayerName } = data;

                const requester = games[gameId].players.find(p => p.id === ws.id);
                if (requester && requester.name === games[gameId].host) {

                    // Filter out the target player
                    games[gameId].players = games[gameId].players.filter(p => p.name !== targetPlayerName);

                    broadcast(gameId, {
                        type: 'player-list-update',
                        players: games[gameId].players,
                        host: games[gameId].host,
                    });

                    // Explicitly tell the kicked player to leave (if they are still connected)
                    //TODO You might want to send a specific "kicked" message type
                }
            }
            if (data.type === 'request-lobby-state'){
                ws.send(JSON.stringify({
                    type: 'lobby-state',
                    gameId: data.gameId,
                    players: games[data.gameId].players.map((p) => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color,
                    })),
                    host: games[data.gameId].host,
                    categories: normalizeCategories11(games[data.gameId].categories),
                    lockedCategories: games[data.gameId].lockedCategories,
                    inLobby: games[data.gameId].inLobby,
                    isGenerating: Boolean(games[data.gameId].isGenerating),
                }));
            }
            if (data.type === 'create-lobby') {
                const { host, categories } = data;

                let newGameId;
                do {
                    newGameId = Math.random().toString(36).substr(2, 5).toUpperCase();
                } while (games[newGameId]);

                ws.gameId = newGameId;

                let color = "bg-blue-500";
                let text_color = "text-white";

                try {
                    const c = await getColorFromPlayerName(host);
                    if (c?.color) color = c.color;
                    if (c?.text_color) text_color = c.text_color;
                } catch (e) {
                    console.error("Color lookup failed:", e);
                }

                games[newGameId] = {
                    host,
                    players: [{ id: ws.id, name: host, color, text_color }],
                    inLobby: true,
                    categories: normalizeCategories11(categories),
                    lockedCategories: {
                        firstBoard: Array(5).fill(false),
                        secondBoard: Array(5).fill(false),
                        finalJeopardy: Array(1).fill(false),
                    }
                };

                ws.send(JSON.stringify({
                    type: 'lobby-created',
                    gameId: newGameId,
                    categories: normalizeCategories11(categories),
                    players: [{ id: ws.id, name: host, color, text_color }],
                }));
            }

            if (data.type === "leave-lobby") {
                const { gameId, playerId, playerName } = data;
                const name = String(playerId ?? playerName ?? "").trim();

                const effectiveGameId =
                    (gameId && games[gameId] ? gameId : null) ??
                    (ws.gameId && games[ws.gameId] ? ws.gameId : null);

                if (!effectiveGameId || !games[gameId] || !name) return;

                const game = games[effectiveGameId];

                // Only do hard-removal in the lobby
                if (!game.inLobby) return;

                const before = game.players.length;
                game.players = game.players.filter((p) => p.name !== name);

                if (game.players.length === before) return; // nothing to do

                // If host left, reassign host (or delete lobby if empty)
                if (game.host === name) {
                    if (game.players.length === 0) {
                        delete games[effectiveGameId];
                        return;
                    }
                    game.host = game.players[0].name;
                }

                broadcast(gameId, {
                    type: "player-list-update",
                    players: game.players.map((p) => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color,
                    })),
                    host: game.host,
                });

                return;
            }

            if (data.type === 'join-lobby') {
                const { gameId, playerName } = data;

                if (!games[gameId]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Lobby does not exist!' }));
                    return;
                }

                const actualName = (playerName ?? "").trim();
                if (!actualName) {
                    ws.send(JSON.stringify({ type: "error", message: "Invalid name." }));
                    return;
                }

                // 1. Try to find existing player by NAME
                const existingPlayer = games[gameId].players.find(p => p.name === actualName);

                if (existingPlayer) {
                    // RECONNECT: Update the socket ID to the new connection
                    console.log(`[Server] Player ${actualName} reconnected to Lobby ${gameId}`);
                    existingPlayer.id = ws.id; // <--- CRITICAL FIX
                    existingPlayer.online = true;
                    ws.gameId = gameId;
                } else {
                    // NEW PLAYER: Add them to the list
                    const msg = await getColorFromPlayerName(actualName);
                    const raceConditionCheck = games[gameId].players.find(p => p.name === actualName);


                    if (raceConditionCheck) {
                        // Treat it as a reconnect/update instead of a new push
                        raceConditionCheck.id = ws.id;
                        raceConditionCheck.online = true;
                        ws.gameId = gameId;
                    } else {
                        // Safe to push new player
                        const color = msg?.color || "bg-blue-500";
                        const text_color = msg?.text_color || "text-white";

                        games[gameId].players.push({
                            id: ws.id,
                            name: actualName,
                            color,
                            text_color
                        });
                        ws.gameId = gameId;
                    }
                }

                // Always send state
                ws.send(JSON.stringify({
                    type: 'lobby-state',
                    gameId,
                    players: games[gameId].players.map((p) => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color,
                    })),
                    host: games[gameId].host,
                    categories: normalizeCategories11(games[gameId].categories),
                    lockedCategories: games[gameId].lockedCategories,
                    inLobby: games[gameId].inLobby,
                    isGenerating: Boolean(games[gameId].isGenerating),
                }));

                broadcast(gameId, {
                    type: 'player-list-update',
                    players: games[gameId].players.map((p) => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color,
                    })),
                    host: games[gameId].host,
                });
            }

            if (data.type === 'create-game') {
                const {gameId, categories, selectedModel, host, temperature, timeToBuzz, timeToAnswer} = data;

                if (games[gameId]) games[gameId].isGenerating = true;

                broadcast(gameId, { type: 'trigger-loading' });

                const boardData = await createBoardData(categories, selectedModel, host, temperature);

                console.log(boardData);

                if (!games[gameId] || !boardData) {
                    console.log("error starting game: " + gameId + " board data failed to create");
                    broadcast(gameId, {
                        type: 'create-board-failed',
                    });
                } else if (games[gameId].inLobby) {
                    games[gameId].buzzed = null;
                    games[gameId].buzzerLocked = true;
                    games[gameId].clearedClues = new Set();
                    games[gameId].boardData = boardData;
                    games[gameId].scores = {};
                    games[gameId].inLobby = false;
                    games[gameId].timeToBuzz = timeToBuzz;
                    games[gameId].timeToAnswer = timeToAnswer;
                    //todo suspect I subtract tokens here
                    console.log(games[gameId].players);
                    broadcast(gameId, {
                        type: 'start-game',
                        host: host,

                    });
                }else{
                    console.log("error moving from lobby to game. game already in progress.");
                }

            }

            if (data.type === 'check-lobby') {
                console.log("checking lobby: " + data.gameId);
                const {gameId} = data;
                let isValid = false;
                if (games[gameId] && games[gameId].inLobby === true) {
                    isValid = true;
                }

                ws.send(JSON.stringify({ type: 'check-lobby-response', isValid, gameId }));
            }

            if (data.type === 'check-cotd') {
                ws.send(JSON.stringify({ type: 'category-of-the-day', cotd }));
            }

            if (data.type === 'toggle-lock-category') {
                const { gameId, boardType, index, locked } = data;

                if (games[gameId]) {

                    // Update the specific lock state for the given boardType and index
                    games[gameId].lockedCategories[boardType][index] = locked;

                    // Notify all players in the game about the updated lock state
                    broadcast(gameId, {
                        type: 'category-lock-updated',
                        boardType,
                        index,
                        locked,
                    });
                } else {
                    console.error(`[Server] Game ID ${gameId} not found when toggling lock for a category.`);
                }
            }

            if (data.type === "update-category") {
                const { gameId, boardType, index, value } = data;

                if (!games[gameId]) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: `Game ${gameId} not found while updating category.`,
                    }));
                    return;
                }

                const game = games[gameId];

                // Enforce lock server-side (prevents bypass / stale UI)
                if (
                    (boardType === "firstBoard" || boardType === "secondBoard") &&
                    game.lockedCategories?.[boardType]?.[index]
                ) return;

                if (boardType === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) return;

                game.categories = normalizeCategories11(game.categories);

                // Map boardType/index -> global index in the flat 11 array
                let globalIndex = -1;
                if (boardType === "firstBoard") globalIndex = index;          // 0-4
                else if (boardType === "secondBoard") globalIndex = 5 + index; // 5-9
                else if (boardType === "finalJeopardy") globalIndex = 10;      // 10

                if (globalIndex < 0 || globalIndex > 10) return;

                game.categories[globalIndex] = String(value ?? "");

                // Broadcast only the patch (no full array overwrite race)
                broadcast(gameId, {
                    type: "category-updated",
                    boardType,
                    index: boardType === "finalJeopardy" ? 0 : index,
                    value: game.categories[globalIndex],
                });

                console.log(`[Server] Category updated for game ${gameId}: ${boardType}[${index}] -> ${value}`);
            }

            if (data.type === 'update-categories') {
                const { gameId, categories } = data;

                if (games[gameId]) {
                    const next = normalizeCategories11(categories);
                    games[gameId].categories = next;


                    broadcast(gameId, {
                        type: 'categories-updated',
                        categories: next,
                    });

                    console.log(`[Server] Categories updated for game ${gameId}:`, next);
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Game ${gameId} not found while updating categories.`,
                    }));
                }
            }


            if (data.type === 'buzz') {
                const { gameId } = data;

                games[gameId].timerVersion = (games[gameId].timerVersion || 0) + 1;
                const currentVersion = games[gameId].timerVersion;


                if (games[gameId] && !games[gameId].buzzed) {
                    const player = games[gameId].players.find(player => player.id === ws.id);
                    if (player && player.name){
                        games[gameId].buzzed = player.name;
                        // Notify all players who buzzed first
                        broadcast(gameId, {
                            type: 'buzz-result',
                            playerName: player.name,
                        });
                    }
                }


                // Only start timer if timeToBuzz is not -1 (infinite time)
                if (games[gameId].timeToAnswer !== -1) {
                    // Store the end time (current time + duration)
                    const endTime = Date.now() + (games[gameId].timeToAnswer * 1000);
                    games[gameId].timerEndTime = endTime;

                    // Broadcast initial timer state to all players
                    broadcast(gameId, {
                        type: 'timer-start',
                        endTime: endTime,
                        duration: games[gameId].timeToAnswer,
                        timerVersion: currentVersion
                    });

                    setTimeout(() => {
                        // Only lock the buzzer if it hasn't been locked already
                        if (games[gameId] && games[gameId].timerVersion === currentVersion
                            && games[gameId].buzzed) {
                            games[gameId].timerEndTime = null; // Clear the timer end time
                            broadcast(gameId, {type: 'timer-end'});
                        }
                    }, games[gameId].timeToBuzz * 1000);
                }
            }

            if (data.type === 'reset-buzzer') {
                const {gameId} = data;

                if (games[gameId]) {
                    games[gameId].buzzed = null;
                    games[gameId].buzzerLocked = true;

                    games[gameId].timerVersion = (games[gameId].timerVersion || 0) + 1;

                    // Notify all players to reset the buzzer
                    broadcast(gameId, {type: 'reset-buzzer'});
                }
            }

            if (data.type === 'mark-all-complete') {
                const {gameId} = data;

                if (games[gameId]) {
                    const game = games[gameId];

                    // Determine all clues based on boardData
                    if (game.boardData) {
                        const {firstBoard, finalJeopardy} = game.boardData;
                        const clearCluesFromBoard = (board) => {
                            board.forEach(category => {
                                category.values.forEach(clue => {
                                    const clueId = `${clue.value}-${clue.question}`;
                                    game.clearedClues.add(clueId); // Add all clues to "clearedClues" set
                                });
                            });
                        };

                        // Clear clues for the two main boards
                        if (firstBoard) clearCluesFromBoard(firstBoard.categories);
                        //if (secondBoard) clearCluesFromBoard(secondBoard.categories);

                        // Handle Final Jeopardy clue
                        if (finalJeopardy && finalJeopardy.categories.values && finalJeopardy.categories.values[0]) {
                            const finalClueId = `${finalJeopardy.categories.values[0].question}`;
                            game.clearedClues.add(finalClueId);
                        }

                        // Broadcast the updated cleared clues to all clients
                        broadcast(gameId, {
                            type: 'all-clues-cleared',
                            clearedClues: Array.from(game.clearedClues), // Send the cleared clues as an array
                        });
                    }
                } else {
                    console.error(`[Server] Game ID ${gameId} not found when marking all clues complete.`);
                }
            }
            if (data.type === 'trigger-game-over') {
                const {gameId} = data;

                broadcast(gameId, {
                    type: 'game-over',
                });
            }
            if (data.type === 'clue-selected') {
                const {gameId, clue} = data;

                if (games[gameId]) {
                    games[gameId].selectedClue = {
                        ...clue,
                        isAnswerRevealed: false, // Add if the answer is revealed or not
                    };

                    // Reset buzzer state
                    games[gameId].buzzed = null;
                    games[gameId].buzzerLocked = true;

                    // Broadcast the selected clue to all players in the game
                    broadcast(gameId, {
                        type: 'clue-selected',
                        clue: games[gameId].selectedClue, // Send the clue and answer reveal status
                        clearedClues: Array.from(games[gameId].clearedClues),
                    });

                    broadcast(gameId, {type: 'reset-buzzer'});
                    broadcast(gameId, {type: 'buzzer-locked'});
                } else {
                    console.error(`[Server] Game ID ${gameId} not found when selecting clue.`);
                }
            }

            if (data.type === 'join-game') {
                const { gameId, playerName } = data;

                if (!playerName || !playerName.trim()) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Player name cannot be blank.' }));
                    return;
                }

                if (!games[gameId]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Game does not exist!' }));
                    return;
                }

                // 1. Find player by NAME (The Source of Truth)
                const existingPlayer = games[gameId].players.find((p) => p.name === playerName);

                if (existingPlayer) {
                    // RECONNECT LOGIC
                    console.log(`[Server] Player ${playerName} reconnected to Game ${gameId}`);

                    // Update their socket ID so server sends messages to the right place
                    existingPlayer.id = ws.id;
                    existingPlayer.online = true;
                    ws.gameId = gameId;

                    // Force this socket to know it belongs to this game
                    // (This prevents the 'kick-player' host check from failing later)

                } else {
                    // NEW PLAYER LOGIC
                    // Only add if they truly aren't in the list
                    const colorData = await getColorFromPlayerName(playerName);
                    const raceConditionCheck = games[gameId].players.find((p) => p.name === playerName);

                    if (raceConditionCheck) {
                        raceConditionCheck.id = ws.id;
                        raceConditionCheck.online = true;
                        ws.gameId = gameId;
                    } else {
                        const newPlayer = {
                            id: ws.id,
                            name: playerName,
                            color: colorData?.color || "bg-blue-500",
                            text_color: colorData?.text_color || "text-white",
                            online: true
                        };
                        games[gameId].players.push(newPlayer);
                        ws.gameId = gameId;
                    }
                }

                // 2. Hydrate Client State
                // Send EVERYTHING needed to sync the client to right now
                ws.send(JSON.stringify({
                    type: 'game-state',
                    gameId,
                    players: games[gameId].players.map(p => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color
                    })),
                    host: games[gameId].host,
                    buzzResult: games[gameId].buzzed,
                    clearedClues: Array.from(games[gameId].clearedClues || new Set()),
                    boardData: games[gameId].boardData,
                    selectedClue: games[gameId].selectedClue || null,
                    buzzerLocked: games[gameId].buzzerLocked,
                    scores: games[gameId].scores,
                    // Sync timers
                    timerEndTime: games[gameId].timerEndTime,
                    timerDuration: games[gameId].timeToAnswer
                }));

                // Notify others
                broadcast(gameId, {
                    type: 'player-list-update',
                    players: games[gameId].players.map(p => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color
                    })),
                    host: games[gameId].host,
                });
            }

            if (data.type === 'request-player-list') {
                const { gameId } = data;
                ws.send(JSON.stringify({
                    type: 'player-list-update',
                    gameId,
                    players: games[gameId].players.map((p) => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color,
                    })),
                    host: games[gameId].host,
                }));
            }

            if (data.type === "leave-game") {
                const { gameId, playerName } = data;
                if (!gameId || !games[gameId]) return;

                const game = games[gameId];

                // Prefer explicit name (intentional leave), fallback to socket id
                const name = String(playerName || "").trim();

                const leavingPlayer =
                    (name && game.players.find(p => p.name === name)) ||
                    game.players.find(p => p.id === ws.id);

                if (!leavingPlayer) return;

                const leavingName = leavingPlayer.name;

                // HARD REMOVE from players
                game.players = game.players.filter(p => p.name !== leavingName);

                // PURGE any state that can block FJ
                if (game.wagers) delete game.wagers[leavingName];
                if (game.drawings) delete game.drawings[leavingName];
                if (game.scores) delete game.scores[leavingName];

                // If host left, reassign (or delete if empty)
                if (game.host === leavingName) {
                    if (game.players.length === 0) {
                        delete games[gameId];
                        return;
                    }
                    game.host = game.players[0].name;
                }

                // Stop this socket from continuing to receive broadcasts for this game
                ws.gameId = null;

                broadcast(gameId, {
                    type: "player-list-update",
                    players: game.players.map(p => ({
                        name: p.name,
                        color: p.color,
                        text_color: p.text_color,
                        online: p.online !== false,
                    })),
                    host: game.host,
                });
                // After removal, re-check whether we can unblock Final Jeopardy
               maybeBroadcastAllWagersSubmitted(gameId);
               maybeBroadcastAllFinalDrawingsSubmitted(gameId);

                return;
            }



            if (data.type === 'reveal-answer') {
                const {gameId} = data;

                if (games[gameId] && games[gameId].selectedClue) {
                    // Update the clue's state to mark the answer as revealed
                    games[gameId].selectedClue.isAnswerRevealed = true;

                    // Notify all players to display the answer
                    broadcast(gameId, {
                        type: 'answer-revealed',
                    });
                } else {
                    console.error(`[Server] Game ID ${gameId} not found or no clue selected when revealing answer.`);
                }
            }

            if (data.type === 'return-to-board') {
                const {gameId} = data;

                if (games[gameId]) {
                    games[gameId].selectedClue = null; // Clear the selected clue
                    // Notify all clients to return to the board
                    broadcast(gameId, {
                        type: 'returned-to-board',
                    });
                } else {
                    console.error(`[Server] Game ID ${gameId} not found when returning to board.`);
                }
            }

            if (data.type === 'clue-cleared') {
                const {gameId, clueId} = data;

                if (games[gameId]) {
                    // Add the cleared clue to the game's cleared clues set
                    if (!games[gameId].clearedClues) {
                        games[gameId].clearedClues = new Set();
                    }
                    games[gameId].clearedClues.add(clueId);

                    // Broadcast to all players that this clue has been cleared
                    broadcast(gameId, {
                        type: 'clue-cleared',
                        clueId,
                    });
                } else {
                    console.error(`[Server] Game ID ${gameId} not found when clearing clue.`);
                }
            }

            if (data.type === 'unlock-buzzer') {
                const {gameId} = data;

                if (games[gameId]) {
                    games[gameId].buzzerLocked = false; // Unlock the buzzer

                    games[gameId].timerVersion = (games[gameId].timerVersion || 0) + 1;
                    const currentVersion = games[gameId].timerVersion;

                    broadcast(gameId, {type: 'buzzer-unlocked'}); // Notify all players

                    // Only start timer if timeToBuzz is not -1 (infinite time)
                    if (games[gameId].timeToBuzz !== -1) {
                        // Store the end time (current time + duration)
                        const endTime = Date.now() + (games[gameId].timeToBuzz * 1000);
                        games[gameId].timerEndTime = endTime;

                        // Broadcast initial timer state to all players
                        broadcast(gameId, {
                            type: 'timer-start',
                            endTime: endTime,
                            duration: games[gameId].timeToBuzz,
                            timerVersion: currentVersion
                        });

                        setTimeout(() => {
                            // Only lock the buzzer if it hasn't been locked already
                            if (games[gameId] && !games[gameId].buzzerLocked &&
                                games[gameId].timerVersion === currentVersion
                                && !games[gameId].buzzed) {
                                games[gameId].buzzerLocked = true;
                                games[gameId].timerEndTime = null; // Clear the timer end time
                                broadcast(gameId, {type: 'buzzer-locked'});
                                broadcast(gameId, {type: 'timer-end'});
                                broadcast(gameId, {type: 'answer-revealed'});
                            }
                        }, games[gameId].timeToBuzz * 1000);
                    }
                }
            }

            if (data.type === 'lock-buzzer') {
                const {gameId} = data;

                if (games[gameId]) {
                    games[gameId].buzzerLocked = true; // Lock the buzzer
                    broadcast(gameId, {type: 'buzzer-locked'}); // Notify all players
                }
            }

            if (data.type === 'transition-to-second-board') {
                const {gameId} = data;

                if (games[gameId]) {
                    broadcast(gameId, {type: 'transition-to-second-board'});
                } else {
                    console.error(`[Server] Game ID ${gameId} not found for board transition.`);
                }
            }

            if (data.type === 'update-score') {
                const {gameId, player, delta} = data;

                if (games[gameId]) {
                    // Update score
                    const game = games[gameId];
                    game.scores[player] = (game.scores[player] || 0) + delta;
                    console.log(game.scores);
                    // Broadcast updated scores
                    broadcast(gameId, {
                        type: 'update-scores',
                        scores: game.scores,
                    });
                }
            }

            if (data.type === "submit-wager") {
                const {gameId, player, wager} = data;

                if (games[gameId]) {
                    if (!games[gameId].wagers) {
                        games[gameId].wagers = {};
                    }
                    games[gameId].wagers[player] = wager;

                    broadcast(gameId, {
                        type: "wager-update",
                        player,
                        wager,
                    });
                    maybeBroadcastAllWagersSubmitted(gameId);
                }
            }

            if (data.type === 'transition-to-final-jeopardy') {
                const { gameId } = data;

                if (games[gameId]) {
                    const game = games[gameId];

                    game.isFinalJeopardy = true;
                    game.finalJeopardyStage = "wager"; // "wager" -> "drawing" -> "done"

                    game.wagers = {};
                    game.drawings = {};

                    broadcast(gameId, { type: 'final-jeopardy' });
                } else {
                    console.error(`[Server] Game ID ${gameId} not found for board transition.`);
                }
            }


            if (data.type === 'final-jeopardy-drawing') {
                const {gameId, player, drawing} = data;

                if (games[gameId]) {
                    // Initialize the drawings object if not present
                    if (!games[gameId].drawings) {
                        games[gameId].drawings = {};
                    }

                    // Parse the drawing if it’s a string
                    let parsedDrawing;
                    try {
                        parsedDrawing = typeof drawing === 'string' ? JSON.parse(drawing) : drawing;
                    } catch (error) {
                        console.error(`[Server] Failed to parse drawing for player ${player}:`, error.message);
                        return; // Exit early if the drawing can't be parsed
                    }

                    // Store the player's drawing as an object
                    games[gameId].drawings[player] = parsedDrawing;

                    // Broadcast that the player's drawing is submitted
                    broadcast(gameId, {
                        type: 'final-jeopardy-drawing-submitted',
                        player,
                    });

                    maybeBroadcastAllFinalDrawingsSubmitted(gameId);
                } else {
                    console.error(`[Server] Game ID ${gameId} not found when submitting final jeopardy drawing.`);
                }
            }
        } catch (e) {
            console.error("[Server] Failed to parse message:", e);
        }
    });

    ws.on('close', () => {
        console.log(`WebSocket closed for socket ${ws.id}`);

        const gameId = ws.gameId;
        if (!gameId || !games[gameId]) return;

        const game = games[gameId];
        const player = game.players.find((p) => p.id === ws.id);
        if (!player) return;

        if (game.inLobby) {
            const leavingName = player.name;
            console.log(`[Server] Player ${leavingName} disconnected in lobby (hard remove).`);

            game.players = game.players.filter((p) => p.id !== ws.id);

            // If host left, reassign host (or delete lobby if empty)
            if (game.host === leavingName) {
                if (game.players.length === 0) {
                    delete games[gameId];
                    return;
                }
                game.host = game.players[0].name;
            }

            broadcast(gameId, {
                type: "player-list-update",
                players: game.players.map((p) => ({
                    name: p.name,
                    color: p.color,
                    text_color: p.text_color,
                    online: true, // lobby should never have "offline" players
                })),
                host: game.host,
            });

            return;
        }

        console.log(`[Server] Player ${player.name} disconnected (soft).`);
        player.online = false;

        broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
                online: p.online !== false,
            })),
            host: game.host,
        });

        // Unblock Final Jeopardy if they were required
        maybeBroadcastAllWagersSubmitted(gameId);
        maybeBroadcastAllFinalDrawingsSubmitted(gameId);
    });

});

// Broadcast a message to all clients in a specific game
function broadcast(gameId, message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.gameId === gameId) { // Match client by gameId
            client.send(JSON.stringify({ ...message }));
        }
    });
}

function isOnline(p) {
    return p?.online !== false; // undefined -> treated as online
}

function getExpectedFinalists(game) {
    if (!game) return [];

    // Solo game: only player is also the one who must submit
    if (game.players.length === 1) return [game.players[0]];

    // Normal: host does NOT submit; only online contestants count
    return game.players.filter(p => p.name !== game.host && isOnline(p));
}

function maybeBroadcastAllWagersSubmitted(gameId) {
    const game = games[gameId];
    if (!game) return;

    if (!game.isFinalJeopardy || game.finalJeopardyStage !== "wager") return;

    const expected = getExpectedFinalists(game).map(p => p.name);

    const wagers = game.wagers || {};
    const allSubmitted = expected.every(name =>
        Object.prototype.hasOwnProperty.call(wagers, name)
    );

    // If no expected finalists (everyone offline), that still means "done"
    if (expected.length === 0 || allSubmitted) {
        game.finalJeopardyStage = "drawing";
        broadcast(gameId, { type: "all-wagers-submitted", wagers });
    }
}


function maybeBroadcastAllFinalDrawingsSubmitted(gameId) {
    const game = games[gameId];
    if (!game) return;

    if (!game.isFinalJeopardy || game.finalJeopardyStage !== "drawing") return;

    const expected = getExpectedFinalists(game).map(p => p.name);

    const drawings = game.drawings || {};
    const allSubmitted = expected.every(name =>
        Object.prototype.hasOwnProperty.call(drawings, name)
    );

    if (expected.length === 0 || allSubmitted) {
        game.finalJeopardyStage = "done";
        broadcast(gameId, { type: "all-final-jeopardy-drawings-submitted", drawings });
    }
}


setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log(`Terminating dead connection for client ${ws.id}`);
            return ws.terminate(); // Terminate the connection if unresponsive
        }

        // Mark as inactive until the client responds with a pong
        ws.isAlive = false;
        ws.ping(); // Send a ping for the client to respond with pong
    });
}, PING_INTERVAL);

cotd = await createCategoryOfTheDay();
setInterval(async () => {
    cotd = await createCategoryOfTheDay();
}, 60000 * 60);



