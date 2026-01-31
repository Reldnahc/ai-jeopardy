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
import {createBoardData} from "../services/aiService.js";
import { getRoleForUserId, verifySupabaseAccessToken } from "../services/userService.js";
import {checkAllFinalDrawingsSubmitted, checkAllWagersSubmitted} from "../game/finalJeopardy.js";
import {isBoardFullyCleared, startFinalJeopardy} from "../game/stageTransition.js";
import {getCOTD} from "../state/cotdStore.js";
import {collectImageAssetIdsFromBoard} from "../services/imageAssetService.js";
import { supabase } from "../config/database.js";

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

export const createWsContext = (wss) => {
    const { broadcast, broadcastAll } = makeBroadcaster(wss);

    const ttsDuration = createTtsDurationService({ supabase, r2 });

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
                    if (!game.buzzerLocked && !game.buzzed) {
                        game.buzzerLocked = true;
                        broadcast(gameId, { type: "buzzer-locked" });
                        broadcast(gameId, { type: "answer-revealed" });
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
    };
};
