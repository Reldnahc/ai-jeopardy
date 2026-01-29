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
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./services/r2Client.js";
import { createTrace } from "./services/trace.js";
import { games } from "./state/gamesStore.js";
import { scheduleLobbyCleanupIfEmpty, cancelLobbyCleanup } from "./lobby/cleanup.js";
import { buildLobbyState, sendLobbySnapshot } from "./lobby/snapshot.js";
import { startGameTimer } from "./game/timer.js";
import { normalizeCategories11, validateImportedBoardData, parseBoardJson } from "./validation/boardImport.js";
import { requireHost, isHostSocket } from "./auth/hostGuard.js";
import { attachWebSocketServer } from "./ws/index.js";

const app = express(); // Initialize Express app
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

server.listen(3002, () => {
    console.log("HTTP + WS listening on :3002");
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

let cotd =
    {
        category: "",
        description: ""
    };

function isBoardFullyCleared(game, boardKey) {
    const board = game?.boardData?.[boardKey];
    if (!board?.categories) return false;

    for (const cat of board.categories) {
        for (const clue of cat.values || []) {
            const clueId = `${clue.value}-${clue.question}`;
            if (!game.clearedClues?.has(clueId)) return false;
        }
    }
    return true;
}

function startFinalJeopardy(gameId, game, broadcast) {
    game.activeBoard = "finalJeopardy";
    game.isFinalJeopardy = true;
    game.finalJeopardyStage = "wager";

    game.wagers = {};
    game.drawings = {};

    broadcast(gameId, { type: "final-jeopardy" });
}

// ... create http server + wss ...
attachWebSocketServer(wss);

// wss.on("connection", (ws) => {
//     ws.id = Math.random().toString(36).substr(2, 9); // Assign a unique ID to each socket
//     console.log('New client connected');
//     ws.isAlive = true; // Mark connection as alive when established
//
//     ws.on("pong", () => {
//         ws.isAlive = true; // Mark as healthy when a pong is received
//     });
//
//     ws.on("message", async (message) => {
//         try {
//             const text = typeof message === "string" ? message : message.toString("utf8");
//             console.log("[Server] raw message:", text);
//             const data = JSON.parse(text);
//             console.log(`[Server] Received message from client ${ws.id}:`, data);
//             if (data.type === "create-game" || data.type === "join-game" ||
//                 data.type === "" || data.type === "" ||
//                 data.type === "") {
//                 // Assign the game ID to the WebSocket instance
//                 ws.gameId = data.gameId;
//             }
//
//             if (data.type === "create-game") {
//                 const {
//                     gameId,
//                     categories,
//                     selectedModel,
//                     host,
//                     timeToBuzz,
//                     timeToAnswer,
//                     boardJson,
//                     includeVisuals,
//                 } = data;
//                 const trace = createTrace("create-game", { gameId, host });
//                 trace.mark("ws_received", { type: "create-game" });
//
//                 const usingImportedBoard = Boolean(boardJson && boardJson.trim());
//                 const effectiveIncludeVisuals = usingImportedBoard
//                     ? true
//                     : Boolean(includeVisuals);
//
//                 if (!games[gameId]) {
//                     broadcast(gameId, { type: "create-board-failed", message: "Game not found." });
//                     return;
//                 }
//
//                 // Host-only
//                 if (!isHostSocket(games[gameId], ws)) {
//                     ws.send(JSON.stringify({ type: "error", message: "Only the host can start the game." }));
//                     sendLobbySnapshot(ws, gameId);
//                     return;
//                 }
//
//                 // Always show loading UI briefly
//                 broadcast(gameId, { type: "trigger-loading" });
//
//                 let boardData = null;
//
//                 try {
//                     if (typeof boardJson === "string" && boardJson.trim().length > 0) {
//                         // IMPORT FLOW
//                         const imported = parseBoardJson(boardJson);
//                         const v = validateImportedBoardData(imported);
//                         if (!v.ok) {
//                             broadcast(gameId, { type: "create-board-failed", message: v.error });
//                             games[gameId].isGenerating = false;
//                             return;
//                         }
//                         boardData = imported;
//                     } else {
//                         // AI FLOW
//                         games[gameId].isGenerating = true;
//                         trace.mark("createBoardData_start");
//                         boardData = await createBoardData(categories, selectedModel, host, {
//                             includeVisuals: effectiveIncludeVisuals,
//                             maxVisualCluesPerCategory: 2,
//                             trace,
//                         });
//                         trace.mark("createBoardData_end");
//                     }
//                 } catch (e) {
//                     console.error("[Server] create-game failed:", e);
//                     broadcast(gameId, { type: 'create-board-failed', message: 'Invalid board JSON or generation failed.' });
//                     games[gameId].isGenerating = false;
//                     return;
//                 }
//
//                 if (!games[gameId] || !boardData) {
//                     console.log("error starting game: " + gameId + " board data failed to create");
//                     broadcast(gameId, { type: 'create-board-failed', message: 'Board data was empty.' });
//                     games[gameId].isGenerating = false;
//                     return;
//                 }
//
//                 if (!games[gameId].inLobby) {
//                     console.log("error moving from lobby to game. game already in progress.");
//                     games[gameId].isGenerating = false;
//                     return;
//                 }
//
//                 // START GAME (same as your existing)
//                 games[gameId].buzzed = null;
//                 games[gameId].buzzerLocked = true;
//                 games[gameId].buzzLockouts = {};
//                 games[gameId].clearedClues = new Set();
//                 games[gameId].boardData = boardData;
//                 games[gameId].scores = {};
//                 games[gameId].inLobby = false;
//                 games[gameId].timeToBuzz = timeToBuzz;
//                 games[gameId].timeToAnswer = timeToAnswer;
//                 games[gameId].isGenerating = false;
//                 games[gameId].activeBoard = "firstBoard";
//                 games[gameId].isFinalJeopardy = false;
//                 games[gameId].finalJeopardyStage = null;
//
//                 trace.mark("broadcast_game_state_start");
//                 broadcast(gameId, {
//                     type: 'start-game',
//                     host: host,
//                 });
//                 trace.mark("broadcast_game_state_end");
//                 trace.end({ success: true });
//             }
//
//
//             if (data.type === "check-cotd") {
//                 ws.send(JSON.stringify({ type: 'category-of-the-day', cotd }));
//             }
//
//             if (data.type === "buzz") {
//                 const { gameId } = data;
//                 const game = games[gameId];
//                 if (!game) return;
//
//                 const player = game.players.find((p) => p.id === ws.id);
//                 if (!player?.name) return;
//
//                 if (!game.buzzLockouts) game.buzzLockouts = {};
//
//                 const now = Date.now();
//                 const lockoutUntil = game.buzzLockouts[player.name] || 0;
//
//                 // Already buzzed by someone else
//                 if (game.buzzed) {
//                     ws.send(JSON.stringify({
//                         type: "buzz-denied",
//                         reason: "already-buzzed",
//                         lockoutUntil: lockoutUntil,
//                     }));
//                     return;
//                 }
//
//                 // Player is currently locked out (from early buzzing)
//                 if (lockoutUntil > now) {
//                     ws.send(JSON.stringify({
//                         type: "buzz-denied",
//                         reason: "locked-out",
//                         lockoutUntil,
//                     }));
//                     return;
//                 }
//
//                 // Buzzer is locked => early buzz => apply lockout
//                 if (game.buzzerLocked) {
//                     const EARLY_BUZZ_LOCKOUT_MS = 1000; // match your current behavior (was 1s)
//                     const until = now + EARLY_BUZZ_LOCKOUT_MS;
//                     game.buzzLockouts[player.name] = until;
//
//                     ws.send(JSON.stringify({
//                         type: "buzz-denied",
//                         reason: "early",
//                         lockoutUntil: until,
//                     }));
//                     return;
//                 }
//
//                 // Accept buzz
//                 game.buzzed = player.name;
//                 broadcast(gameId, { type: "buzz-result", playerName: player.name });
//
//                 if (game.timeToAnswer !== -1) {
//                     startGameTimer(gameId, game, broadcast, game.timeToAnswer, "answer");
//                 }
//             }
//
//             if (data.type === "reset-buzzer") {
//                 const { gameId } = data;
//                 if (!requireHost(games[gameId], ws)) return;
//
//                 const game = games[gameId];
//                 if (!game) return;
//
//                 game.buzzed = null;
//                 game.buzzerLocked = true;
//                 games[gameId].buzzLockouts = {};
//
//                 game.timerEndTime = null;
//
//                 game.timerVersion = (game.timerVersion || 0) + 1;
//
//                 broadcast(gameId, { type: "reset-buzzer" });
//                 broadcast(gameId, { type: "buzzer-locked" });
//                 broadcast(gameId, { type: "timer-end", timerVersion: (games[gameId]?.timerVersion || 0) }); // client now clears on reset-buzzer anyway
//             }
//
//
//             if (data.type === "mark-all-complete") {
//                 const {gameId} = data;
//                 if (!requireHost(games[gameId], ws)) return;
//
//                 if (games[gameId]) {
//                     const game = games[gameId];
//
//                     // Determine all clues based on boardData
//                     if (game.boardData) {
//                         const {firstBoard, finalJeopardy} = game.boardData;
//                         const clearCluesFromBoard = (board) => {
//                             board.forEach(category => {
//                                 category.values.forEach(clue => {
//                                     const clueId = `${clue.value}-${clue.question}`;
//                                     game.clearedClues.add(clueId); // Add all clues to "clearedClues" set
//                                 });
//                             });
//                         };
//
//                         // Clear clues for the two main boards
//                         if (firstBoard) clearCluesFromBoard(firstBoard.categories);
//                         //if (secondBoard) clearCluesFromBoard(secondBoard.categories);
//
//                         // Handle Final Jeopardy clue
//                         if (finalJeopardy && finalJeopardy.categories.values && finalJeopardy.categories.values[0]) {
//                             const finalClueId = `${finalJeopardy.categories.values[0].question}`;
//                             game.clearedClues.add(finalClueId);
//                         }
//
//                         // Broadcast the updated cleared clues to all clients
//                         broadcast(gameId, {
//                             type: "all-clues-cleared",
//                             clearedClues: Array.from(game.clearedClues), // Send the cleared clues as an array
//                         });
//                     }
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found when marking all clues complete.`);
//                 }
//             }
//             if (data.type === "trigger-game-over") {
//                 const {gameId} = data;
//                 if (!requireHost(games[gameId], ws)) return;
//
//                 broadcast(gameId, {
//                     type: "game-over",
//                 });
//             }
//             if (data.type === "clue-selected") {
//                 const {gameId, clue} = data;
//                 if (!requireHost(games[gameId], ws)) return;
//
//                 if (games[gameId]) {
//                     games[gameId].selectedClue = {
//                         ...clue,
//                         isAnswerRevealed: false, // Add if the answer is revealed or not
//                     };
//
//                     // Reset buzzer state
//                     games[gameId].buzzed = null;
//                     games[gameId].buzzerLocked = true;
//                     games[gameId].buzzLockouts = {};
//                     // Broadcast the selected clue to all players in the game
//                     broadcast(gameId, {
//                         type: "clue-selected",
//                         clue: games[gameId].selectedClue, // Send the clue and answer reveal status
//                         clearedClues: Array.from(games[gameId].clearedClues),
//                     });
//
//                     broadcast(gameId, {type: "reset-buzzer"});
//                     broadcast(gameId, {type: "buzzer-locked"});
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found when selecting clue.`);
//                 }
//             }
//
//             if (data.type === "join-game") {
//                 const { gameId, playerName } = data;
//
//                 if (!playerName || !playerName.trim()) {
//                     ws.send(JSON.stringify({ type: 'error', message: 'Player name cannot be blank.' }));
//                     return;
//                 }
//
//                 if (!games[gameId]) {
//                     ws.send(JSON.stringify({ type: 'error', message: 'Game does not exist!' }));
//                     return;
//                 }
//
//                 // 1. Find player by NAME (The Source of Truth)
//                 const existingPlayer = games[gameId].players.find((p) => p.name === playerName);
//
//                 if (existingPlayer) {
//                     // RECONNECT LOGIC
//                     console.log(`[Server] Player ${playerName} reconnected to Game ${gameId}`);
//
//                     // Update their socket ID so server sends messages to the right place
//                     existingPlayer.id = ws.id;
//                     existingPlayer.online = true;
//                     ws.gameId = gameId;
//
//                     // Force this socket to know it belongs to this game
//                     // (This prevents the 'kick-player' host check from failing later)
//
//                 } else {
//                     // NEW PLAYER LOGIC
//                     // Only add if they truly aren't in the list
//                     const colorData = await getColorFromPlayerName(playerName);
//                     const raceConditionCheck = games[gameId].players.find((p) => p.name === playerName);
//
//                     if (raceConditionCheck) {
//                         raceConditionCheck.id = ws.id;
//                         raceConditionCheck.online = true;
//                         ws.gameId = gameId;
//                     } else {
//                         const newPlayer = {
//                             id: ws.id,
//                             name: playerName,
//                             color: colorData?.color || "bg-blue-500",
//                             text_color: colorData?.text_color || "text-white",
//                             online: true
//                         };
//                         games[gameId].players.push(newPlayer);
//                         ws.gameId = gameId;
//                     }
//                 }
//
//                 const game = games[gameId];
//                 const me = game.players.find(p => p.id === ws.id) || game.players.find(p => p.name === playerName);
//                 const myName = me?.name;
//                 const myLockoutUntil = myName ? (game.buzzLockouts?.[myName] || 0) : 0;
//
//                 // 2. Hydrate Client State
//                 // Send EVERYTHING needed to sync the client to right now
//                 ws.send(JSON.stringify({
//                     type: "game-state",
//                     gameId,
//                     players: games[gameId].players.map(p => ({
//                         name: p.name,
//                         color: p.color,
//                         text_color: p.text_color
//                     })),
//                     host: games[gameId].host,
//                     buzzResult: games[gameId].buzzed,
//                     playerBuzzLockoutUntil: myLockoutUntil,
//                     clearedClues: Array.from(games[gameId].clearedClues || new Set()),
//                     boardData: games[gameId].boardData,
//                     selectedClue: games[gameId].selectedClue || null,
//                     buzzerLocked: games[gameId].buzzerLocked,
//                     scores: games[gameId].scores,
//                     // Sync timers
//                     timerEndTime: games[gameId].timerEndTime,
//                     timerDuration: games[gameId].timerDuration,
//                     timerVersion: games[gameId].timerVersion || 0,
//                     activeBoard: games[gameId].activeBoard || "firstBoard",
//                     isFinalJeopardy: Boolean(games[gameId].isFinalJeopardy),
//                     finalJeopardyStage: games[gameId].finalJeopardyStage || null,
//                     wagers: games[gameId].wagers || {},
//                 }));
//
//                 // Notify others
//                 broadcast(gameId, {
//                     type: "player-list-update",
//                     players: games[gameId].players.map(p => ({
//                         name: p.name,
//                         color: p.color,
//                         text_color: p.text_color
//                     })),
//                     host: games[gameId].host,
//                 });
//             }
//
//             if (data.type === "request-player-list") {
//                 const { gameId } = data;
//                 ws.send(JSON.stringify({
//                     type: "player-list-update",
//                     gameId,
//                     players: games[gameId].players.map((p) => ({
//                         name: p.name,
//                         color: p.color,
//                         text_color: p.text_color,
//                     })),
//                     host: games[gameId].host,
//                 }));
//             }
//
//             if (data.type === "leave-game") {
//                 const { gameId, playerName } = data;
//                 if (!gameId || !games[gameId]) return;
//
//                 const game = games[gameId];
//
//                 // Prefer explicit name (intentional leave), fallback to socket id
//                 const name = String(playerName || "").trim();
//
//                 const leavingPlayer =
//                     (name && game.players.find(p => p.name === name)) ||
//                     game.players.find(p => p.id === ws.id);
//
//                 if (!leavingPlayer) return;
//
//                 const leavingName = leavingPlayer.name;
//
//                 // HARD REMOVE from players
//                 game.players = game.players.filter(p => p.name !== leavingName);
//
//                 // PURGE any state that can block FJ
//                 if (game.wagers) delete game.wagers[leavingName];
//                 if (game.drawings) delete game.drawings[leavingName];
//                 if (game.scores) delete game.scores[leavingName];
//
//                 // If host left, reassign (or delete if empty)
//                 if (game.host === leavingName) {
//                     if (game.players.length === 0) {
//                         delete games[gameId];
//                         return;
//                     }
//                     game.host = game.players[0].name;
//                 }
//
//                 // Stop this socket from continuing to receive broadcasts for this game
//                 ws.gameId = null;
//
//                 broadcast(gameId, {
//                     type: "player-list-update",
//                     players: game.players.map(p => ({
//                         name: p.name,
//                         color: p.color,
//                         text_color: p.text_color,
//                         online: p.online !== false,
//                     })),
//                     host: game.host,
//                 });
//                 // After removal, re-check whether we can unblock Final Jeopardy
//                 maybeBroadcastAllWagersSubmitted(gameId);
//                 maybeBroadcastAllFinalDrawingsSubmitted(gameId);
//
//                 return;
//             }
//
//
//
//             if (data.type === "reveal-answer") {
//                 const {gameId} = data;
//
//                 if (games[gameId] && games[gameId].selectedClue) {
//                     // Update the clue's state to mark the answer as revealed
//                     games[gameId].selectedClue.isAnswerRevealed = true;
//
//                     // Notify all players to display the answer
//                     broadcast(gameId, {
//                         type: "answer-revealed",
//                         clue: games[gameId].selectedClue,
//                     });
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found or no clue selected when revealing answer.`);
//                 }
//             }
//
//             if (data.type === "return-to-board") {
//                 const { gameId } = data;
//                 const game = games[gameId];
//                 if (!game) return;
//
//                 game.selectedClue = null;
//
//                 broadcast(gameId, {
//                     type: "returned-to-board",
//                     selectedClue: null,
//                 });
//
//                 return;
//             }
//
//             if (data.type === "clue-cleared") {
//                 const { gameId, clueId } = data;
//
//                 if (games[gameId]) {
//                     const game = games[gameId];
//
//                     if (!game.clearedClues) game.clearedClues = new Set();
//                     game.clearedClues.add(clueId);
//
//                     broadcast(gameId, { type: "clue-cleared", clueId });
//
//                     if (game.activeBoard === "firstBoard" && isBoardFullyCleared(game, "firstBoard")) {
//                         game.activeBoard = "secondBoard";
//                         game.isFinalJeopardy = false;
//                         game.finalJeopardyStage = null;
//                         broadcast(gameId, { type: "transition-to-second-board" });
//                     }
//
//                     if (game.activeBoard === "secondBoard" && isBoardFullyCleared(game, "secondBoard")) {
//                         startFinalJeopardy(gameId, game, broadcast);
//                     }
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found when clearing clue.`);
//                 }
//             }
//
//
//             if (data.type === "unlock-buzzer") {
//                 const { gameId } = data;
//                 const game = games[gameId];
//                 if (!game) return;
//                 if (!requireHost(game, ws)) return;
//
//                 game.buzzerLocked = false;
//                 broadcast(gameId, { type: "buzzer-unlocked" });
//
//                 if (game.timeToBuzz !== -1) {
//                     startGameTimer(
//                         gameId,
//                         game,
//                         broadcast,
//                         game.timeToBuzz,
//                         "buzz",
//                         ({ gameId, game, broadcast }) => {
//                             if (!game.buzzerLocked && !game.buzzed) {
//                                 game.buzzerLocked = true;
//                                 broadcast(gameId, { type: "buzzer-locked" });
//                                 broadcast(gameId, { type: "answer-revealed" });
//                             }
//                         }
//                     );
//                 }
//             }
//
//             if (data.type === "lock-buzzer") {
//                 const {gameId} = data;
//                 if (!requireHost(games[gameId], ws)) return;
//
//                 if (games[gameId]) {
//                     games[gameId].buzzerLocked = true; // Lock the buzzer
//                     broadcast(gameId, {type: 'buzzer-locked'}); // Notify all players
//                 }
//             }
//
//             if (data.type === "transition-to-second-board") {
//                 const { gameId } = data;
//                 if (!requireHost(games[gameId], ws)) return;
//
//                 if (games[gameId]) {
//                     const game = games[gameId];
//                     game.activeBoard = "secondBoard";
//                     game.isFinalJeopardy = false;
//                     game.finalJeopardyStage = null;
//
//                     broadcast(gameId, { type: "transition-to-second-board" });
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found for board transition.`);
//                 }
//             }
//
//             if (data.type === "mark-all-complete") {
//                 const { gameId } = data;
//                 const game = games[gameId];
//                 if (!game) return;
//
//                 if (!game.clearedClues) game.clearedClues = new Set();
//
//                 const boardKey = game.activeBoard || "firstBoard";
//                 const board = game.boardData?.[boardKey];
//
//                 if (!board?.categories) return;
//
//                 for (const cat of board.categories) {
//                     for (const clue of cat.values || []) {
//                         const clueId = `${clue.value}-${clue.question}`;
//                         game.clearedClues.add(clueId);
//                     }
//                 }
//
//                 // Broadcast an authoritative update that includes clearedClues
//                 broadcast(gameId, {
//                     type: "cleared-clues-sync",
//                     clearedClues: Array.from(game.clearedClues),
//                 });
//
//                 // If you're doing server-side auto transitions, trigger them here too
//                 // (use the same transition logic you use after clue-cleared)
//                 if (game.activeBoard === "firstBoard" && isBoardFullyCleared(game, "firstBoard")) {
//                     game.activeBoard = "secondBoard";
//                     broadcast(gameId, { type: "transition-to-second-board" });
//                 } else if (game.activeBoard === "secondBoard" && isBoardFullyCleared(game, "secondBoard")) {
//                     // however you start final jeopardy now
//                     startFinalJeopardy(gameId, game, broadcast);
//                 }
//
//                 return;
//             }
//
//
//             if (data.type === "update-score") {
//                 const { gameId, player, delta } = data;
//                 const game = games[gameId];
//                 if (!game) return;
//
//                 const hostPlayer = game.players?.find(p => p.name === game.host);
//                 if (hostPlayer && hostPlayer.id !== ws.id) return;
//
//                 if (!game.scores) game.scores = {};
//                 game.scores[player] = (game.scores[player] || 0) + Number(delta || 0);
//
//                 broadcast(gameId, {
//                     type: "update-scores",
//                     scores: game.scores,
//                 });
//             }
//
//
//
//             if (data.type === "submit-wager") {
//                 const {gameId, player, wager} = data;
//
//                 if (games[gameId]) {
//                     if (!games[gameId].wagers) {
//                         games[gameId].wagers = {};
//                     }
//                     games[gameId].wagers[player] = wager;
//
//                     broadcast(gameId, {
//                         type: "wager-update",
//                         player,
//                         wager,
//                     });
//                     maybeBroadcastAllWagersSubmitted(gameId);
//                 }
//             }
//
//             if (data.type === "transition-to-final-jeopardy") {
//                 const { gameId } = data;
//
//                 if (games[gameId]) {
//                     const game = games[gameId];
//
//                     game.isFinalJeopardy = true;
//                     game.finalJeopardyStage = "wager"; // "wager" -> "drawing" -> "done"
//
//                     game.wagers = {};
//                     game.drawings = {};
//
//                     broadcast(gameId, { type: "final-jeopardy" });
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found for board transition.`);
//                 }
//             }
//
//
//             if (data.type === "final-jeopardy-drawing") {
//                 const {gameId, player, drawing} = data;
//
//                 if (games[gameId]) {
//                     // Initialize the drawings object if not present
//                     if (!games[gameId].drawings) {
//                         games[gameId].drawings = {};
//                     }
//
//                     // Parse the drawing if it’s a string
//                     let parsedDrawing;
//                     try {
//                         parsedDrawing = typeof drawing === 'string' ? JSON.parse(drawing) : drawing;
//                     } catch (error) {
//                         console.error(`[Server] Failed to parse drawing for player ${player}:`, error.message);
//                         return; // Exit early if the drawing can't be parsed
//                     }
//
//                     // Store the player's drawing as an object
//                     games[gameId].drawings[player] = parsedDrawing;
//
//                     // Broadcast that the player's drawing is submitted
//                     broadcast(gameId, {
//                         type: "final-jeopardy-drawing-submitted",
//                         player,
//                     });
//
//                     maybeBroadcastAllFinalDrawingsSubmitted(gameId);
//                 } else {
//                     console.error(`[Server] Game ID ${gameId} not found when submitting final jeopardy drawing.`);
//                 }
//             }
//         } catch (e) {
//             console.error("[Server] Failed to parse message:", e);
//         }
//     });
//
// });


cotd = await createCategoryOfTheDay();
setInterval(async () => {
    cotd = await createCategoryOfTheDay();
}, 60000 * 60);

app.get("/api/images/:assetId", async (req, res) => {
    try {
        const { assetId } = req.params;

        const { data, error } = await supabase
            .from("image_assets")
            .select("storage_key, content_type")
            .eq("id", assetId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: "Image asset not found" });
        }

        const storageKey = data.storage_key;
        const contentType = data.content_type || "image/webp";

        const cmd = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: storageKey,
        });

        const obj = await r2.send(cmd);

        res.setHeader("Content-Type", contentType);
        // cache hard; if you ever change an image, it should get a new sha256/key anyway
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

        // obj.Body is a stream
        obj.Body.pipe(res);
    } catch (e) {
        console.error("GET /api/images/:assetId failed:", e);
        res.status(500).json({ error: "Failed to load image" });
    }
});

app.get("/test/image/:assetId", async (req, res) => {
    const { assetId } = req.params;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Image Test</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; }
          img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
          code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h2>R2 Image Serve Test</h2>
        <p>assetId: <code>${assetId}</code></p>
        <p>URL: <code>/api/images/${assetId}</code></p>
        <img src="/api/images/${assetId}" alt="test image" />
      </body>
    </html>
  `);
});

app.get("/api/image-assets/:assetId", async (req, res) => {
    const { assetId } = req.params;

    const { data, error } = await supabase
        .from("image_assets")
        .select("*")
        .eq("id", assetId)
        .single();

    if (error || !data) return res.status(404).json({ error: "Not found" });
    res.json(data);
});

// SPA fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});