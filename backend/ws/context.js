import { games } from "../state/gamesStore.js";
import {modelsByValue} from "../../shared/models.js";
import { makeBroadcaster } from "./broadcast.js";
import { scheduleLobbyCleanupIfEmpty, cancelLobbyCleanup } from "../lobby/cleanup.js";
import { sendLobbySnapshot, buildLobbyState, getPlayerForSocket } from "../lobby/snapshot.js";
import { startGameTimer, clearGameTimer } from "../game/timer.js";
import { validateImportedBoardData, parseBoardJson, normalizeCategories11 } from "../validation/boardImport.js";
import { requireHost, isHostSocket } from "../auth/hostGuard.js";
import {getColorFromPlayerName, playerStableId} from "../services/userService.js";
import {createTrace} from "../services/trace.js";
import {createBoardData, judgeClueAnswerFast} from "../services/aiService.js";
import { getRoleForUserId, verifySupabaseAccessToken } from "../services/userService.js";
import {checkAllFinalDrawingsSubmitted, checkAllWagersSubmitted} from "../game/finalJeopardy.js";
import {isBoardFullyCleared, startFinalJeopardy} from "../game/stageTransition.js";
import {getCOTD} from "../state/cotdStore.js";
import {collectImageAssetIdsFromBoard} from "../services/imageAssetService.js";
import { supabase } from "../config/database.js";
import { transcribeAnswerAudio } from "../services/sttService.js";

import {
    applyNewGameState,
    clearGenerationProgress, ensureBoardTtsAssets,
    ensureHostOrFail,
    ensureLobbySettings, getBoardDataOrFail,
    getGameOrFail,
    normalizeRole,
    resetGenerationProgressAndNotify,
    resolveModelOrFail,
    resolveVisualPolicy,
    safeAbortGeneration,
    setupPreloadHandshake
} from "./handlers/game/createGameHelpers.js";
import {ensureTtsAsset} from "../services/ttsAssetService.js";
import {createTtsDurationService} from "../services/ttsDurationService.js";
import {r2} from "../services/r2Client.js";
import {clearAnswerWindow, startAnswerWindow} from "../game/answerWindow.js";

export const createWsContext = (wss) => {
    const { broadcast, broadcastAll } = makeBroadcaster(wss);

    const ttsDuration = createTtsDurationService({ supabase, r2 });

    function estimateSpeechMs(text) {
        const t = String(text || "").trim();
        if (!t) return 500;
        const words = t.split(/\s+/).filter(Boolean).length;

        // Heuristic: ~2.5 words/sec + padding
        const base = 500;
        const perWord = 380;
        const punct = (t.match(/[.!?]/g) || []).length * 220;

        return base + words * perWord + punct;
    }

    function newSpeechId() {
        return Math.random().toString(36).slice(2, 10);
    }

    function aiHostSay(gameId, text) {
        const speechId = newSpeechId();
        const ms = estimateSpeechMs(text);

        broadcast(gameId, {
            type: "ai-host-say",
            gameId,
            speechId,
            text,
            durationMs: ms,
        });

        return { speechId, ms };
    }

    function aiAfter(gameId, delayMs, fn) {
        // Use your existing timer system so it’s centralized.
        // startGameTimer signature in this file: startGameTimer(gameId, game, broadcast, seconds, kind, onExpire?)
        // But we need ms granularity; easiest is setTimeout with safe game lookup:

        setTimeout(() => {
            try { fn(); } catch (e) { console.error("[aiAfter]", e); }
        }, Math.max(0, Number(delayMs || 0)));
    }


    function cancelAutoUnlock(game) {
        if (game?.autoUnlockTimer) {
            clearTimeout(game.autoUnlockTimer);
            game.autoUnlockTimer = null;
        }
        game.autoUnlockClueKey = null;
    }

    function doUnlockBuzzerAuthoritative({ gameId, game }) {
        if (!game) return;

        // If already unlocked or clue changed, ignore
        if (!game.buzzerLocked) return;

        game.buzzerLocked = false;
        broadcast(gameId, { type: "buzzer-unlocked" });

        if (game.timeToBuzz !== -1) {
            startGameTimer(
                gameId,
                game,
                broadcast,
                game.timeToBuzz,
                "buzz",
                ({ gameId, game }) => {
                    if (!game) return;
                    if (!game.selectedClue) return;

                    // If still open and nobody buzzed => AI host resolves it
                    if (!game.buzzerLocked && !game.buzzed) {
                        game.buzzerLocked = true;
                        broadcast(gameId, { type: "buzzer-locked" });

                        // AI host line + reveal immediately
                        const { ms } = aiHostSay(gameId, "Looks like nobody got it.");

                        game.selectedClue.isAnswerRevealed = true;
                        broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

                        // After speech + small pause => return to board
                        aiAfter(gameId, ms + 700, () => {
                            const g = games?.[gameId];
                            if (!g) return;
                            if (!g.selectedClue) return;

                            // clear the clue (authoritative)
                            if (!g.clearedClues) g.clearedClues = new Set();
                            const clueId = `${g.selectedClue.value}-${g.selectedClue.question}`;
                            g.clearedClues.add(clueId);
                            broadcast(gameId, { type: "clue-cleared", clueId });

                            // reset state
                            g.selectedClue = null;
                            g.buzzed = null;
                            g.phase = "board";
                            g.buzzerLocked = true;

                            // IMPORTANT: selector stays the same (requirement)
                            broadcast(gameId, {
                                type: "phase-changed",
                                phase: "board",
                                selectorKey: g.selectorKey ?? null,
                                selectorName: g.selectorName ?? null,
                            });

                            broadcast(gameId, { type: "returned-to-board", selectedClue: null });
                        });
                    }
                }
            );
        }
    }

    async function scheduleAutoUnlockForClue({ gameId, game, clueKey, ttsAssetId }) {
        if (!game) return;

        cancelAutoUnlock(game);

        // if no asset id, just unlock immediately (never deadlock)
        if (!ttsAssetId) {
            doUnlockBuzzerAuthoritative({ gameId, game });
            return;
        }

        const durationMs = await ttsDuration.getDurationMs(ttsAssetId);

        // If we couldn't compute duration, unlock immediately (still safe)
        const waitMs = Math.max(0, (durationMs ?? 0) + 150); // +buffer for decode/play
        game.autoUnlockClueKey = clueKey;

        game.autoUnlockTimer = setTimeout(() => {
            const g = games?.[gameId];
            if (!g) return;

            // Only unlock if we're still on the same clue
            if (g.autoUnlockClueKey !== clueKey) return;

            g.autoUnlockTimer = null;
            doUnlockBuzzerAuthoritative({ gameId, game: g });
        }, waitMs);
    }

    return {
        wss,
        games,
        modelsByValue,
        supabase,
        r2,
        getTtsDurationMs: (assetId) => ttsDuration.getDurationMs(assetId),

        // comms
        broadcast,
        broadcastAll,

        // lobby lifecycle
        scheduleLobbyCleanupIfEmpty,
        cancelLobbyCleanup,

        // snapshots
        sendLobbySnapshot,
        buildLobbyState,
        getPlayerForSocket,

        // timers
        startGameTimer,
        clearGameTimer,

        // import / categories
        validateImportedBoardData,
        parseBoardJson,
        normalizeCategories11,

        // auth
        requireHost,
        isHostSocket,
        getRoleForUserId,
        verifySupabaseAccessToken,

        // answer capture window
        startAnswerWindow,
        clearAnswerWindow,

        // inference
        transcribeAnswerAudio,
        judgeClueAnswerFast,

        //create-game
        getGameOrFail,
        ensureHostOrFail,
        ensureLobbySettings,
        normalizeRole,
        resolveModelOrFail,
        resolveVisualPolicy,
        resetGenerationProgressAndNotify,
        clearGenerationProgress,
        safeAbortGeneration,
        applyNewGameState,
        setupPreloadHandshake,
        ensureBoardTtsAssets,
        getBoardDataOrFail,
        ensureTtsAsset,

        getColorFromPlayerName,
        createTrace,
        createBoardData,
        checkAllWagersSubmitted,
        checkAllFinalDrawingsSubmitted,
        isBoardFullyCleared,
        startFinalJeopardy,
        getCOTD,
        collectImageAssetIdsFromBoard,
        playerStableId,

        cancelAutoUnlock,
        scheduleAutoUnlockForClue,
        doUnlockBuzzerAuthoritative,

        aiHostSay,
        aiAfter,
        estimateSpeechMs,
    };
};
