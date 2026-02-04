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
import {createBoardData, judgeClueAnswerFast, judgeImage} from "../services/aiService.js";
import { getRoleForUserId, verifySupabaseAccessToken } from "../services/userService.js";
import {
    checkAllDrawingsSubmitted,
    checkAllWagersSubmitted,
    submitDrawing,
    submitWager
} from "../game/finalJeopardy.js";
import {checkBoardTransition, isBoardFullyCleared} from "../game/stageTransition.js";
import {getCOTD} from "../state/cotdStore.js";
import {collectImageAssetIdsFromBoard} from "../services/imageAssetService.js";
import { supabase } from "../config/database.js";
import { transcribeAnswerAudio } from "../services/sttService.js";

import {
    applyNewGameState, broadcastPreloadBatch,
    clearGenerationProgress, ensureBoardTtsAssets,
    ensureHostOrFail,
    ensureLobbySettings, getBoardDataOrFail,
    getGameOrFail, initPreloadState,
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
import {
    autoResolveAfterJudgement,
    cancelAutoUnlock, doUnlockBuzzerAuthoritative, findCategoryForClue,
    parseClueValue,
    scheduleAutoUnlockForClue
} from "../game/gameLogic.js";
import {
    aiAfter,
    aiHostSayCategory,
    aiHostSayPlayerName,
    aiHostSayRandomFromSlot,
    ensureAiHostTtsBank
} from "../game/host.js";
import {verifyJwt} from "../auth/jwt.js";

export const createWsContext = (wss) => {
    const { broadcast, broadcastAll } = makeBroadcaster(wss);

    const ttsDuration = createTtsDurationService({ supabase, r2 });

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


    return {
        wss,
        games,
        modelsByValue,
        supabase,
        r2,
        getTtsDurationMs: (assetId) => ttsDuration.getDurationMs(assetId),
        sleep,

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
        judgeImage,

        findCategoryForClue,

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
        ensureBoardTtsAssets,
        getBoardDataOrFail,
        ensureTtsAsset,

        getColorFromPlayerName,
        createTrace,
        createBoardData,
        submitWager,
        submitDrawing,
        checkAllWagersSubmitted,
        checkAllDrawingsSubmitted,
        isBoardFullyCleared,
        getCOTD,
        collectImageAssetIdsFromBoard,
        playerStableId,

        cancelAutoUnlock,
        scheduleAutoUnlockForClue,
        doUnlockBuzzerAuthoritative,

        aiAfter,
        ensureAiHostTtsBank,

        aiHostSayRandomFromSlot,
        aiHostSayPlayerName,
        aiHostSayCategory,
        verifyJwt,
        setupPreloadHandshake,
        initPreloadState,
        broadcastPreloadBatch,
        checkBoardTransition,
        parseClueValue,
        autoResolveAfterJudgement
    };
};
