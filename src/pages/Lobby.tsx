import React, { useEffect, useState } from 'react';
import randomCategoryList from '../data/randomCategories';
import { useLocation, useNavigate, useParams} from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import LobbySidebar from "../components/lobby/LobbySidebar.tsx";
import LoadingScreen from "../components/common/LoadingScreen.tsx";
import HostControls from "../components/lobby/HostControls.tsx";
import FinalJeopardyCategory from "../components/lobby/FinalJeopardyCategory.tsx";
import CategoryBoard from "../components/lobby/CategoryBoard.tsx";
import {Player} from "../types/Lobby.ts";
import {useProfile} from "../contexts/ProfileContext.tsx";
import {useAlert} from "../contexts/AlertContext.tsx";
import { motion } from 'framer-motion';
import {useNavigationBlocker} from "../hooks/useNavigationBlocker.ts";

type LockedCategories = {
    firstBoard: boolean[]; // Jeopardy lock states
    secondBoard: boolean[]; // Double Jeopardy lock states
    finalJeopardy: boolean[];
};

type BoardType = 'firstBoard' | 'secondBoard';

const Lobby: React.FC = () => {
    const location = useLocation();

    const [categories, setCategories] = useState<{
        firstBoard: string[];
        secondBoard: string[];
        finalJeopardy: string;
    }>({
        firstBoard: ['', '', '', '', ''],
        secondBoard: ['', '', '', '', ''],
        finalJeopardy: '',
    });
    const isHost = location.state?.isHost || false;
    const { gameId } = useParams<{ gameId: string }>();
    const [isLoading, setIsLoading] = useState(false);
    const [allowLeave, setAllowLeave] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [temperature, setTemperature] = useState(0.1);
    const [timeToBuzz, setTimeToBuzz] = useState(10);
    const [timeToAnswer, setTimeToAnswer] = useState(10);
    const [copySuccess, setCopySuccess] = useState(false);
    const [players, setPlayers] = useState<Player[]>(location.state?.players || []);
    const [host, setHost] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState('gpt-4o-mini'); // Default value for dropdown
    const [lockedCategories, setLockedCategories] = useState<LockedCategories>({
        firstBoard: Array(5).fill(false), // Default unlocked
        secondBoard: Array(5).fill(false), // Default unlocked
        finalJeopardy: Array(1).fill(false),
    });

    const { socket, isSocketReady } = useWebSocket();
    const navigate = useNavigate();
    const { profile } = useProfile();
    const { showAlert } = useAlert();

    const handleLeaveLobby = () => {
        console.log("leave lobby called");
        if (socket && isSocketReady && profile?.displayname) {
            socket.send(JSON.stringify({
                type: 'leave-lobby',
                gameId,
                playerId: profile.displayname
            }));
        }
    };

    const { setIsLeavingPage } = useNavigationBlocker({
        shouldBlock: !allowLeave,
        onLeave: handleLeaveLobby,
        confirmMessage: 'Are you sure you want to leave? This will remove you from the current lobby.'
    });

    useEffect(() => {
        if (allowLeave && socket && isSocketReady && profile && profile.displayname) {
            socket.send(
                JSON.stringify({
                    type: 'join-game',
                    gameId,
                    playerName: profile?.displayname,
                })
            );

            navigate(`/game/${gameId}`, {
                state: {
                    playerName: profile?.displayname.trim(),
                    isHost: isHost,
                    host: host,
                },
            });
        }
    }, [allowLeave]);


    useEffect(() => {
        if (socket && isSocketReady) {
            setIsLoading(true);
            setLoadingMessage("Joining lobby...");


            socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                console.log(message);
                if (message.type === 'player-list-update') {
                    const sortedPlayers = [...message.players].sort((a, b) => {
                        if (a.name === message.host) return -1;
                        if (b.name === message.host) return 1;
                        return 0;
                    });
                    setPlayers(sortedPlayers);
                    setHost(message.host);
                }

                if (message.type === 'lobby-state') {
                    setPlayers(message.players);
                    setHost(message.host);
                    if (message.categories) {
                        console.log(message.categories);
                        setCategories({
                            firstBoard: message.categories.slice(0, 5),
                            secondBoard: message.categories.slice(5, 10),
                            finalJeopardy: message.categories[10],
                        });
                    }
                    if (message.lockedCategories) {
                        setLockedCategories({
                            firstBoard: message.lockedCategories.firstBoard,
                            secondBoard: message.lockedCategories.secondBoard,
                            finalJeopardy: message.lockedCategories.finalJeopardy,
                        });
                    }

                    setIsLoading(false);
                    setLoadingMessage("");
                }

                if (message.type === 'category-lock-updated') {
                    console.log(message);
                    if (message.boardType in lockedCategories) {
                        setLockedCategories((prev) => {
                            const updated: LockedCategories = { ...prev };
                            updated[message.boardType as BoardType][message.index] = message.locked; // Type-safe access
                            return updated;
                        });
                    } else {
                        console.error(`Invalid boardType: ${message.boardType}`);
                    }
                }

                // Sync updated categories
                if (message.type === 'categories-updated') {
                    setCategories({
                        firstBoard: message.categories.slice(0, 5),
                        secondBoard: message.categories.slice(5, 10),
                        finalJeopardy: message.categories[10],
                    });
                }

                if (message.type === 'trigger-loading') {
                    setIsLoading(true);
                    setLoadingMessage('Generating your questions');
                }

                if (message.type === 'create-board-failed') {
                    setIsLoading(false);
                    showAlert(
                        <span>
                            <span className="text-red-500 font-bold text-xl">Game generation failed.</span><br/>
                            <span
                                className="text-gray-900 font-bold text-xl">Try again. If the issue persists try another model.</span><br/>
                        </span>,
                        [
                            {
                                label: "Okay",
                                actionValue: "continue",
                                styleClass: "bg-green-500 text-white hover:bg-green-600",
                            },

                        ]
                    );
                }

                if (message.type === 'start-game' && profile) {
                    setIsLoading(false);
                    setIsLeavingPage(true);
                    setAllowLeave(true);
                }

                if (message.type === 'check-lobby-response') {
                    if (!message.isValid) {
                        navigate("/");
                        return;
                    }

                    setLoadingMessage("Syncing lobby state...");
                    socket.send(JSON.stringify({
                        type: 'request-lobby-state',
                        gameId,
                    }));
                }
                
            };
            socket.send(
                JSON.stringify({
                    type: 'check-lobby',
                    gameId,
                })
            );

            setIsLoading(true);
        }
    }, [isSocketReady, gameId, socket, profile, lockedCategories, showAlert, setIsLeavingPage, navigate]);

    const onToggleLock = (
        boardType: 'firstBoard' | 'secondBoard' | 'finalJeopardy',
        index: number
    ) => {
        if (socket && isSocketReady) {
            socket.send(
                JSON.stringify({
                    type: 'toggle-lock-category',
                    gameId,
                    boardType,
                    index,
                    locked: !lockedCategories[boardType][index], // Toggle current state
                })
            );
        }
    };

    const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedModel(e.target.value);
    };

    const onChangeCategory = (
        boardType: 'firstBoard' | 'secondBoard' | 'finalJeopardy',
        index: number | undefined,
        value: string
    ) => {
        setCategories((prev) => {
            if (boardType === 'finalJeopardy') {
                const updatedCategories = {
                    ...prev,
                    finalJeopardy: value,
                };

                if (socket && isSocketReady) {
                    socket.send(
                        JSON.stringify({
                            type: 'update-categories',
                            gameId,
                            categories: [
                                ...updatedCategories.firstBoard,
                                ...updatedCategories.secondBoard,
                                updatedCategories.finalJeopardy,
                            ],
                        })
                    );
                }

                return updatedCategories;
            }

            const updatedBoard = [...prev[boardType]];
            if (index !== undefined) {
                updatedBoard[index] = value;
            }

            const updatedCategories = {
                ...prev,
                [boardType]: updatedBoard,
            };

            if (socket && isSocketReady) {
                socket.send(
                    JSON.stringify({
                        type: 'update-categories',
                        gameId,
                        categories: [
                            ...updatedCategories.firstBoard,
                            ...updatedCategories.secondBoard,
                            updatedCategories.finalJeopardy,
                        ],
                    })
                );
            }

            return updatedCategories;
        });
    };

    const handleRandomizeCategory = (
        boardType: 'firstBoard' | 'secondBoard' | 'finalJeopardy',
        index?: number
    ) => {
        setCategories((prev) => {
            const updatedCategories = { ...prev };

            if (boardType === 'finalJeopardy') {
                let newCategory;
                do {
                    newCategory =
                        randomCategoryList[Math.floor(Math.random() * randomCategoryList.length)];
                } while (
                    prev.firstBoard.includes(newCategory) ||
                    prev.secondBoard.includes(newCategory) ||
                    prev.finalJeopardy === newCategory
                    );
                updatedCategories.finalJeopardy = newCategory;
            } else if (index !== undefined) {
                const board = [...updatedCategories[boardType]];
                let newCategory;
                do {
                    newCategory =
                        randomCategoryList[Math.floor(Math.random() * randomCategoryList.length)];
                } while (
                    board.includes(newCategory) ||
                    prev.firstBoard.includes(newCategory) ||
                    prev.secondBoard.includes(newCategory)
                    );
                board[index] = newCategory;
                updatedCategories[boardType] = board;
            }

            if (isHost && socket && isSocketReady) {
                socket.send(
                    JSON.stringify({
                        type: 'update-categories',
                        gameId,
                        categories: [
                            ...updatedCategories.firstBoard,
                            ...updatedCategories.secondBoard,
                            updatedCategories.finalJeopardy,
                        ],
                    })
                );
            }

            return updatedCategories;
        });
    };

    const handleCreateGame = async () => {
        if (!profile) {
            showAlert(
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
        if (
            categories.firstBoard.some((c) => !c.trim()) ||
            categories.secondBoard.some((c) => !c.trim())
        ) {
            showAlert(
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

        try {
            setIsLoading(true);
            setLoadingMessage('Generating your questions');

            if (socket && isSocketReady) {
                socket.send(
                    JSON.stringify({
                        type: 'create-game',
                        gameId,
                        host: profile.displayname,
                        temperature,
                        timeToBuzz,
                        timeToAnswer,
                        categories: [
                            ...categories.firstBoard,
                            ...categories.secondBoard,
                            categories.finalJeopardy,
                        ],
                        selectedModel,
                    })
                );
            }
        } catch (error) {
            console.error('Failed to generate board data:', error);
            alert('Failed to generate board data. Please try again.');
        }
    };

    return isLoading ? (
        <LoadingScreen message={loadingMessage}/>
    ) : (
        <div className="min-h-[calc(100vh-5.5rem)] bg-gradient-to-r from-indigo-400 to-blue-700 p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl mx-auto"
            >
                <div className="grid grid-cols-1 lg:grid-cols-4">
                    {/* Sidebar Column */}
                    <div className="lg:col-span-1 border-r border-gray-200 bg-gray-50 p-6">
                        <LobbySidebar
                            gameId={gameId}
                            host={host}
                            players={players}
                            copySuccess={copySuccess}
                            setCopySuccess={setCopySuccess}
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

                            <FinalJeopardyCategory
                                category={categories.finalJeopardy}
                                isHost={isHost}
                                onChangeCategory={onChangeCategory}
                                onRandomizeCategory={handleRandomizeCategory}
                                lockedCategories={lockedCategories.finalJeopardy}
                                onToggleLock={onToggleLock}
                            />
                        </div>

                        {/* Host Controls */}
                        {isHost && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-8 border-t border-gray-200 pt-6"
                            >
                                <HostControls
                                    selectedModel={selectedModel}
                                    onModelChange={handleDropdownChange}
                                    onCreateGame={handleCreateGame}
                                    temperature={temperature}
                                    timeToBuzz={timeToBuzz}
                                    setTemperature={setTemperature}
                                    setTimeToBuzz={setTimeToBuzz}
                                    timeToAnswer={timeToAnswer}
                                    setTimeToAnswer={setTimeToAnswer}
                                    isSoloLobby={players.length <= 1}
                                />
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Lobby;
