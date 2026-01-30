import React, {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import LobbySidebar from "../components/lobby/LobbySidebar.tsx";
import LoadingScreen from "../components/common/LoadingScreen.tsx";
import HostControls from "../components/lobby/HostControls.tsx";
import CategoryBoard, { LobbyBoardType } from "../components/lobby/CategoryBoard.tsx";
import {useProfile} from "../contexts/ProfileContext.tsx";
import {useAlert} from "../contexts/AlertContext.tsx";
import { motion } from 'framer-motion';
import {getUniqueCategories} from "../categories/getUniqueCategories.ts";
import {useGameSession} from "../hooks/useGameSession.ts";
import { useLobbySocketSync } from "../hooks/lobby/useLobbySocketSync";
import {usePlayerIdentity} from "../hooks/usePlayerIdentity.ts";
import {usePreloadImageAssetIds} from "../hooks/game/usePreloadBoardImages.ts";

const Lobby: React.FC = () => {
    const location = useLocation();
    const { gameId } = useParams<{ gameId: string }>();
    const [copySuccess, setCopySuccess] = useState(false);
    const [boardJsonError, setBoardJsonError] = useState<string | null>(null);

    const { sendJson } = useWebSocket();
    const navigate = useNavigate();
    const { profile } = useProfile();
    const { showAlert } = useAlert();
    const { session, saveSession } = useGameSession();

    const { playerKey, effectivePlayerName } = usePlayerIdentity({
        gameId,
        locationStatePlayerName: location.state?.playerName,
    });

    const {
        isSocketReady,
        isLoading,
        loadingMessage,
        loadingProgress,
        setManualLoading,
        allowLeave,
        players,
        host,
        isHostServer,
        categories,
        lockedCategories,
        onPromoteHost,
        onToggleLock,
        onChangeCategory,
        lobbySettings,
        updateLobbySettings,
        lobbyInvalid,
        preloadAssetIds,
        isPreloadingImages,
    } = useLobbySocketSync({
        gameId,
        playerKey,
        effectivePlayerName,
        showAlert,
    });

    const isHost = isHostServer;

    useEffect(() => {
        if (!lobbyInvalid) return;
        navigate("/");
    }, [lobbyInvalid, navigate]);

    useEffect(() => {
        // Any time a new preload request comes in, allow a new ack to be sent.
        preloadAckSentRef.current = false;
    }, [preloadAssetIds]);


    useEffect(() => {
        if (!gameId || !effectivePlayerName) return;

        const shouldUpdate =
            session?.gameId !== gameId ||
            session?.playerName !== effectivePlayerName ||
            session?.isHost !== Boolean(isHost);

        if (!shouldUpdate) return;

        saveSession(gameId, effectivePlayerName, Boolean(isHost));
    }, [gameId, effectivePlayerName, isHost, session?.gameId, session?.playerName, session?.isHost, saveSession]);

    useEffect(() => {
        if (!allowLeave) return;
        if (!isSocketReady) return;
        if (!gameId) return;

        navigate(`/game/${gameId}`, {
            state: {
                playerName: effectivePlayerName,
                isHost,
                host,
            },
        });
    }, [allowLeave, isSocketReady, gameId, isHost, host, navigate, effectivePlayerName]);

    const tryValidateBoardJson = (raw: string): string | null => {
        if (!raw.trim()) return null; // empty means "use AI"

        try {
            const parsed = JSON.parse(raw) as unknown;

            // We only do minimal checks here because server is authoritative.
            if (typeof parsed !== "object" || parsed === null) return "Board JSON must be an object.";

            const p = parsed as any;
            const bd = p.boardData && typeof p.boardData === "object" ? p.boardData : p;

            if (!bd.firstBoard || !bd.secondBoard || !bd.finalJeopardy) {
                return "Missing firstBoard / secondBoard / finalJeopardy.";
            }

            return null;
        } catch {
            return "Invalid JSON (can’t parse).";
        }
    };

    const boardJson = lobbySettings?.boardJson ?? "";
    const usingImportedBoard = Boolean(boardJson.trim());


    const preloadAckSentRef = useRef(false);

    usePreloadImageAssetIds(preloadAssetIds, isPreloadingImages, () => {
        if (preloadAckSentRef.current) return;
        preloadAckSentRef.current = true;

        // Tell server we’re ready
        sendJson({
            type: "preload-done",
            gameId,
            playerName: effectivePlayerName,
            playerKey: playerKey,
        });

        // keep loading UI until start-game arrives
    });

    const handleRandomizeCategory = (boardType: LobbyBoardType, index: number) => {
        if (!isSocketReady) return;
        if (!gameId) return;

        const candidates = getUniqueCategories(25);

        sendJson({
            type: "randomize-category",
            gameId,
            boardType,
            index,
            candidates,
        });
    };

    const handleCreateGame = async () => {
        if (!profile) {
            await showAlert(
                <span>
                    <span className="text-red-500 font-bold text-xl">You need to be logged in to do this.</span><br/>
                </span>,
                [
                    {
                        label: "Okay",
                        actionValue: "okay",
                        styleClass: "bg-green-500 text-white hover:bg-green-600",
                    }]
            );
            return;
        }

        const localJsonError = tryValidateBoardJson(boardJson);
        setBoardJsonError(localJsonError);

        if (usingImportedBoard && localJsonError) {
            await showAlert(
                <span>
                    <span className="text-red-500 font-bold text-xl">Invalid board JSON</span><br/>
                    <span>{localJsonError}</span>
                </span>,
                [
                    {
                        label: "Okay",
                        actionValue: "okay",
                        styleClass: "bg-green-500 text-white hover:bg-green-600",
                    }
                ]
            );
            return;
        }

        // Only require categories when NOT importing
        if (!usingImportedBoard) {
            if (
                categories.firstBoard.some((c) => !c.trim()) ||
                categories.secondBoard.some((c) => !c.trim())
            ) {
                await showAlert(
                    <span>
                        <span className="text-red-500 font-bold text-xl">Please fill in all the categories</span><br/>
                    </span>,
                    [
                        {
                            label: "Okay",
                            actionValue: "okay",
                            styleClass: "bg-green-500 text-white hover:bg-green-600",
                        }]
                );
                return;
            }
        }

        try {
            setManualLoading("Generating your questions...");

            if (!isSocketReady) return;
            if (!gameId) return;

            // Server authoritative: create-game only needs gameId.
            sendJson({
                type: "create-game",
                gameId,
            });
        } catch (error) {
            console.error('Failed to generate board data:', error);
            alert('Failed to generate board data. Please try again.');
        }
    };

    return isLoading ? (
        <LoadingScreen message={loadingMessage} progress={loadingProgress ?? 0} />
    ) : (
        <div className="min-h-[calc(100vh-5.5rem)] bg-gradient-to-r from-indigo-400 to-blue-700 p-6">
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-4">
                    {/* Sidebar Column */}
                    <div className="lg:col-span-1 border-r border-gray-200 bg-gray-50 p-6">
                        <LobbySidebar
                            gameId={gameId}
                            host={host}
                            players={players}
                            copySuccess={copySuccess}
                            setCopySuccess={setCopySuccess}
                            isHost={isHost}
                            onPromoteHost={onPromoteHost}
                        />
                    </div>

                    {/* Main Content Column */}
                    <div className="lg:col-span-3 p-8">
                        {/* Category Boards */}
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ">
                                <div className="min-w-0">
                                    <CategoryBoard
                                        title="Jeopardy!"
                                        categories={categories.firstBoard}
                                        isHost={isHost}
                                        lockedCategories={lockedCategories.firstBoard}
                                        boardType="firstBoard"
                                        onChangeCategory={onChangeCategory}
                                        onRandomizeCategory={handleRandomizeCategory}
                                        onToggleLock={onToggleLock}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <CategoryBoard
                                        title="Double Jeopardy!"
                                        categories={categories.secondBoard}
                                        isHost={isHost}
                                        lockedCategories={lockedCategories.secondBoard}
                                        boardType="secondBoard"
                                        onChangeCategory={onChangeCategory}
                                        onRandomizeCategory={handleRandomizeCategory}
                                        onToggleLock={onToggleLock}
                                    />
                                </div>
                            </div>

                            <CategoryBoard
                                title="Final Jeopardy!"
                                categories={categories.finalJeopardy}
                                isHost={isHost}
                                lockedCategories={lockedCategories.finalJeopardy}
                                boardType="finalJeopardy"
                                onChangeCategory={onChangeCategory}
                                onRandomizeCategory={handleRandomizeCategory}
                                onToggleLock={onToggleLock}
                            />
                        </div>

                        {/* Host Controls */}
                        {isHost && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-8"
                            >
                                <HostControls
                                    onCreateGame={handleCreateGame}
                                    isSoloLobby={players.length <= 1}
                                    boardJsonError={boardJsonError}
                                    setBoardJsonError={setBoardJsonError}
                                    tryValidateBoardJson={tryValidateBoardJson}
                                    lobbySettings={lobbySettings}
                                    updateLobbySettings={updateLobbySettings}
                                />
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Lobby;
