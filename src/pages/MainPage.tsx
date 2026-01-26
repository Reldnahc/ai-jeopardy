import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import randomCategoryList from "../data/randomCategories.ts";
import {useAuth} from "../contexts/AuthContext.tsx";
import {useProfile} from "../contexts/ProfileContext.tsx";
import {useAlert} from "../contexts/AlertContext.tsx";
import { motion } from 'framer-motion';
import PlayerSearch from "../components/main/PlayerSearch.tsx";

export default function MainPage() {
    const [gameId, setGameId] = useState('');
    const [isCreatingLobby, setIsCreatingLobby] = useState(false);
    const [cotd, setCotd] = useState({
        category: "Connecting to server...",
        description: ""
    });

    const { showAlert } = useAlert();
    const { user } = useAuth();
    const { profile, loading: profileLoading, refetchProfile } = useProfile();
    const { socket, isSocketReady } = useWebSocket();
    const navigate = useNavigate();


    const adjectives = [
        "Hallucinated",
        "Intelligent",
        "Dreamt",
        "Generated",
        "Conjured",
        "Created",
    ];

    const randomAdjective = useMemo(
        () => adjectives[Math.floor(Math.random() * adjectives.length)],
        []
    );

    useEffect(() => {
        if (socket && isSocketReady && profile) {
            socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                console.log(message);
                if (message.type === 'category-of-the-day') {
                    setCotd(message.cotd);
                }
                if (message.type === 'lobby-created') {
                    console.log( "received 'lobby-created' message");
                    setIsCreatingLobby(false);
                    navigate(`/lobby/${message.gameId}`, {
                        state: {
                            playerName: profile.displayname,
                            isHost: true,
                            players: message.players,
                            categories: message.categories,
                        },
                    });
                    console.log(message.gameId);
                    socket.send(
                        JSON.stringify({
                            type: 'request-lobby-state',
                            gameId: message.gameId,
                        })
                    );
                }
                if (message.type === 'check-lobby-response') {
                    if (message.isValid){
                        const name = profile ? profile.displayname : '';
                        socket.send(
                            JSON.stringify({
                                type: 'join-lobby',
                                gameId: message.gameId,
                                playerName: name.trim(),
                            })
                        );
                        navigate(`/lobby/${message.gameId}`, {
                            state: {
                                playerName: name.trim(),
                                isHost: false,
                            },
                        });
                    } else {
                        showAlert(
                            <span>
                            <span className="text-red-500 font-bold text-xl">Invalid lobby or game already in progress.</span><br/>
                        </span>,
                            [
                                {
                                    label: "Okay",
                                    actionValue: "okay",
                                    styleClass: "bg-green-500 text-white hover:bg-green-600",
                                }
                            ]
                        );

                    }

                }
            };

            socket.send(
                JSON.stringify({
                    type: 'check-cotd',
                })
            );
        }
    }, [socket, isSocketReady, profile, navigate, showAlert]);
    
    const handleGenerateRandomCategories = () => {
        const shuffledCategories = randomCategoryList.sort(() => 0.5 - Math.random());
        return shuffledCategories.slice(0, 11);
    };

    function sendErrorAlert() {
        showAlert(
            <span>
                <span className="text-red-500 font-bold text-xl">Connection to Websockets failed.</span><br/>
                <span className="text-gray-900 font-semibold">Please refresh the page and try again.</span>
            </span>,
            [
                {
                    label: "Okay",
                    actionValue: "okay",
                    styleClass: "bg-green-500 text-white hover:bg-green-600",
                }
            ]
        );
    }

    const handleCreateGame = async () => {
        if (isCreatingLobby) return;
        if (!user) {
            showAlert(
                <span>
                <span className="text-red-500 font-bold text-xl">Please log in to create a game.</span><br/>
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
        if (socket && isSocketReady && profile) {
            setIsCreatingLobby(true);
            socket.send(
                JSON.stringify({
                    type: 'create-lobby',
                    host: profile.displayname,
                    categories: handleGenerateRandomCategories(),
                })
            );
            console.log('sent create-lobby message');
        } else {
            sendErrorAlert();
        }
    };

    const handleJoinGame = async () => {
        if (isCreatingLobby) return;
        if (!gameId.trim()) {
            await showAlert(
                <span>
                    <span className="text-red-500 font-bold text-xl">Please enter a valid Game ID.</span><br/>
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

        if (!user) {
            const action = await showAlert(
                <span>
                    <span className="text-red-500 font-bold text-xl">You are not logged in.</span><br/>
                    <span
                        className="text-gray-900 font-bold text-xl">Are you sure you want to play as a guest?</span><br/>
                </span>,
                [
                    {
                        label: "Go Back",
                        actionValue: "return",
                        styleClass: "bg-red-500 text-white hover:bg-red-600",
                    },
                    {
                        label: "Continue",
                        actionValue: "continue",
                        styleClass: "bg-green-500 text-white hover:bg-green-600",
                    },

                ]
            );

            if (action === "return") {
                return;
            }
        }

        // Wait for the profile to fully load
        if (profileLoading) {
            console.log("Waiting for profile to finish loading...");
            await refetchProfile(); // Optional - ensures profile is up-to-date
        }

        if (socket && isSocketReady) {
            socket.send(
                JSON.stringify({
                    type: 'check-lobby',
                    gameId,
                })
            );
        } else {
            sendErrorAlert();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex items-center justify-center p-6 ">
            {/* Animated container for the main card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl p-20 pt-4"
            >

                    {/* Main Content (spans two columns on medium+ screens) */}
                    <div className="col-span-2 p-10">
                        <h1 className="text-5xl font-extrabold text-gray-900 text-center">
                            Artificially {randomAdjective} Jeopardy
                        </h1>
                        <p className="text-xl text-gray-700 text-center mt-4">
                            Try to answer with the correct question.
                        </p>

                        {/* Featured Category Card */}
                        <div className="mt-10">
                            <div className="p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                                <div className="text-center mb-6">
                                  <span className="inline-block text-xl uppercase tracking-wider text-gray-500 font-semibold">
                                    Featured Category
                                  </span>
                                </div>

                                <h3 className="text-4xl font-bold text-gray-900 text-center mb-3">
                                    {cotd.category}
                                </h3>

                                <p className="text-lg text-gray-700 text-center max-w-2xl mx-auto leading-relaxed">
                                    {cotd.description}
                                </p>
                            </div>
                        </div>


                        {/* Create & Join Game Section */}
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Create Game Box */}
                            <div className="flex flex-col justify-center items-center bg-gray-50 p-6 rounded-lg border-gray-200 shadow">
                                <button
                                    onClick={handleCreateGame}
                                    disabled={isCreatingLobby}
                                    aria-busy={isCreatingLobby}
                                    className="w-full h-full py-3 px-6 text-white bg-green-500 hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-xl rounded-lg font-semibold transition-colors duration-200"
                                >
                                    {isCreatingLobby ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                                />
                                            </svg>
                                            <span>Creating…</span>
                                        </span>
                                    ) : (
                                        "Create Game"
                                    )}
                                </button>

                                {isCreatingLobby && (
                                    <p className="mt-3 text-sm text-gray-600 text-center">
                                        Creating lobby… this can take a few seconds.
                                    </p>
                                )}

                            </div>

                            {/* Join Game Box */}
                            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow">
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col">
                                        <label htmlFor="gameId" className="text-lg font-medium text-gray-800">
                                            Game ID:
                                        </label>
                                        <input
                                            id="gameId"
                                            type="text"
                                            value={gameId}
                                            onChange={(e) => setGameId(e.target.value)}
                                            placeholder="Enter Game ID to join"
                                            className="mt-2 p-3 border border-gray-300 text-black rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <button
                                        onClick={handleJoinGame}
                                        disabled={isCreatingLobby}
                                        aria-busy={isCreatingLobby}
                                        className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors duration-200"
                                    >
                                        Join Game
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="mt-8">
                            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                                <PlayerSearch/>
                            </div>
                        </div>
                        {/* How to Play Section */}
                        <div className="mt-8">
                            <details className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow" open>
                                <summary className="text-2xl font-semibold text-gray-800 cursor-pointer">
                                    How to Play
                                </summary>

                                <p className="mt-4 text-lg text-gray-700">
                                    Welcome to <strong>AI Jeopardy!</strong> This project is still evolving, so thank you for your patience as new features and improvements are rolled out.
                                </p>

                                <ul className="list-disc ml-6 mt-4 text-lg text-gray-700 space-y-2">
                                    <li>
                                        To create a game, you’ll first need to create an account using the menu in the top-right corner.
                                    </li>
                                    <li>
                                        You do <strong>not</strong> need an account to join a game. Simply enter the game code provided by your host to join as a guest.
                                    </li>
                                    <li>
                                        Creating an account allows you to customize your profile, host games, and access additional features.
                                    </li>
                                    <li>
                                        Once you’re in a lobby, players select the categories they want questions to be generated from.
                                    </li>
                                    <li>
                                        When everyone is ready, the host starts the game by pressing the <strong>“Start Game”</strong> button.
                                    </li>
                                    <li>
                                        During gameplay, the host reads the question and then unlocks the buzzer. Players race to buzz in if they know the answer.
                                    </li>
                                    <li>
                                        Most importantly—have fun, compete, and enjoy the experience!
                                    </li>
                                </ul>
                            </details>
                        </div>

                        <div className="mt-8">
                            <details className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow" open>
                                <summary className="text-2xl font-semibold text-gray-800 cursor-pointer">
                                    About Models
                                </summary>

                                <p className="mt-4 text-lg text-gray-700">
                                    <span className="block text-xl font-semibold text-red-500 mb-2">
                                        Model selection is currently limited.
                                    </span>
                                    <span className="block">
                                        At this time, only the available free models can be selected. Additional model options are visible but locked while the project is in its early stages.
                                    </span>
                                </p>

                                <p className="mt-4 text-lg text-gray-700">
                                    The host will see a model selection field in the lobby settings. In most cases, you can safely leave this set to the default option.
                                    If you’d like to experiment, you can open the dropdown and choose from the available models listed.
                                </p>
                            </details>
                        </div>

                    </div>
            </motion.div>
        </div>
    );
}
