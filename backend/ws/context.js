import { games } from "../state/gamesStore.js";
import {modelsByValue} from "../../shared/models.js";
import { makeBroadcaster } from "./broadcast.js";
import { scheduleLobbyCleanupIfEmpty, cancelLobbyCleanup } from "../lobby/cleanup.js";
import { sendLobbySnapshot, buildLobbyState, getPlayerForSocket } from "../lobby/snapshot.js";
import { startGameTimer, clearGameTimer } from "../game/timer.js";
import { validateImportedBoardData, parseBoardJson, normalizeCategories11 } from "../validation/boardImport.js";
import { requireHost, isHostSocket } from "../auth/hostGuard.js";
import {createTrace} from "../services/trace.js";
import {createBoardData, judgeClueAnswerFast, judgeImage} from "../services/aiService.js";
import {
    checkAllDrawingsSubmitted,
    checkAllWagersSubmitted,
    submitDrawing,
    submitWager
} from "../game/finalJeopardy.js";
import {checkBoardTransition, isBoardFullyCleared} from "../game/stageTransition.js";
import {getCOTD} from "../state/cotdStore.js";
import {collectImageAssetIdsFromBoard} from "../services/imageAssetService.js";
import { transcribeAnswerAudio } from "../services/sttService.js";

import {
    applyNewGameState, broadcastPreloadBatch,
    clearGenerationProgress,
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
import {clearAnswerWindow, startAnswerWindow} from "../game/answerWindow.js";
import {
    autoResolveAfterJudgement,
    cancelAutoUnlock, doUnlockBuzzerAuthoritative, findCategoryForClue,
    parseClueValue,
    scheduleAutoUnlockForClue
} from "../game/gameLogic.js";
import {
    aiHostSayAsset,
    aiHostSayByKey,
    aiHostVoiceSequence,
    ensureAiHostTtsBank, ensureAiHostValueTts
} from "../game/host.ts";
import {verifyJwt} from "../auth/jwt.js";
import {getBearerToken, playerStableId, verifyAccessToken} from "../services/userService.js";

export const createWsContext = (wss, repos) => {
    const { broadcast, broadcastAll } = makeBroadcaster(wss);

    const ttsDuration = createTtsDurationService( repos );

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalizeName = (name) => String(name || "").toLowerCase().trim();

    return {
        wss,
        games,
        modelsByValue,
        getTtsDurationMs: (assetId) => ttsDuration.getDurationMs(assetId),
        sleep,
        repos,
        normalizeName,
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
        getBoardDataOrFail,
        ensureTtsAsset,

        createTrace,
        createBoardData,
        submitWager,
        submitDrawing,
        checkAllWagersSubmitted,
        checkAllDrawingsSubmitted,
        isBoardFullyCleared,
        getCOTD,
        collectImageAssetIdsFromBoard,

        cancelAutoUnlock,
        scheduleAutoUnlockForClue,
        doUnlockBuzzerAuthoritative,

        ensureAiHostTtsBank,
        ensureAiHostValueTts,
        playerStableId,
        getBearerToken,
        verifyAccessToken,
        aiHostVoiceSequence,
        aiHostSayByKey,
        aiHostSayAsset,
        verifyJwt,
        setupPreloadHandshake,
        initPreloadState,
        broadcastPreloadBatch,
        checkBoardTransition,
        parseClueValue,
        autoResolveAfterJudgement
    };
};
