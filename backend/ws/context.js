import { games } from "../state/gamesStore.js";
import {modelsByValue} from "../../shared/models.js";
import { makeBroadcaster } from "./broadcast.js";
import { scheduleLobbyCleanupIfEmpty, cancelLobbyCleanup } from "../lobby/cleanup.js";
import { sendLobbySnapshot, buildLobbyState, getPlayerForSocket } from "../lobby/snapshot.js";
import { startGameTimer, clearGameTimer } from "../game/timer.js";
import { validateImportedBoardData, parseBoardJson, normalizeCategories11 } from "../validation/boardImport.js";
import { requireHost, isHostSocket } from "../auth/hostGuard.js";
import {getColorFromPlayerName} from "../services/userService.js";
import {createTrace} from "../services/trace.js";
import {createBoardData} from "../services/aiService.js";
import { getRoleForUserId, verifySupabaseAccessToken } from "../services/userService.js";
import {checkAllFinalDrawingsSubmitted, checkAllWagersSubmitted} from "../game/finalJeopardy.js";
import {isBoardFullyCleared, startFinalJeopardy} from "../game/stageTransition.js";
import {getCOTD} from "../state/cotdStore.js";

export const createWsContext = (wss) => {
    const { broadcast, broadcastAll } = makeBroadcaster(wss);

    return {
        wss,
        games,
        modelsByValue,

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

        getColorFromPlayerName,
        createTrace,
        createBoardData,
        checkAllWagersSubmitted,
        checkAllFinalDrawingsSubmitted,
        isBoardFullyCleared,
        startFinalJeopardy,
        getCOTD,
    };
};
