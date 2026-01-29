import React, {useEffect, useState} from 'react';
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
import { useBoardJsonImport } from "../hooks/lobby/useBoardJsonImport";
import {flattenBySections} from "../utils/lobbySections";
import { useLobbySocketSync } from "../hooks/lobby/useLobbySocketSync";
import {usePlayerIdentity} from "../hooks/usePlayerIdentity.ts";

const Lobby: React.FC = () => {
    const location = useLocation();
    const { gameId } = useParams<{ gameId: string }>();
    const [timeToBuzz, setTimeToBuzz] = useState(10);
    const [timeToAnswer, setTimeToAnswer] = useState(10);
    const [copySuccess, setCopySuccess] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gpt-5-mini'); // Default value for dropdown
    const [includeVisuals, setIncludeVisuals] = useState(false);

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
        boardJson,
        setBoardJson,
        boardJsonError,
        setBoardJsonError,
        validate: tryValidateBoardJson,
        usingImportedBoard,
    } = useBoardJsonImport();

    const {
        isSocketReady,
        isLoading,
        loadingMessage,
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
        lobbyInvalid,
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

    const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedModel(e.target.value);
    };

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

            sendJson({
                type: "create-game",
                gameId,
                playerKey,
                host: profile.displayname,
                timeToBuzz,
                timeToAnswer,
                categories: flattenBySections(categories),
                selectedModel: usingImportedBoard ? undefined : selectedModel,
                boardJson: boardJson.trim() ? boardJson : undefined,
                includeVisuals,
            });
        } catch (error) {
            console.error('Failed to generate board data:', error);
            alert('Failed to generate board data. Please try again.');
        }
    };

    return isLoading ? (
        <LoadingScreen message={loadingMessage}/>
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
                                    selectedModel={selectedModel}
                                    onModelChange={handleDropdownChange}
                                    onCreateGame={handleCreateGame}
                                    timeToBuzz={timeToBuzz}
                                    setTimeToBuzz={setTimeToBuzz}
                                    timeToAnswer={timeToAnswer}
                                    setTimeToAnswer={setTimeToAnswer}
                                    isSoloLobby={players.length <= 1}
                                    boardJson={boardJson}
                                    setBoardJson={setBoardJson}
                                    boardJsonError={boardJsonError}
                                    setBoardJsonError={setBoardJsonError}
                                    tryValidateBoardJson={tryValidateBoardJson}
                                    includeVisuals={includeVisuals}
                                    setIncludeVisuals={setIncludeVisuals}
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
