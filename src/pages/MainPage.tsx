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
    }, [socket, isSocketReady, profile]);

    const handleGenerateRandomCategories = () => {
        const shuffledCategories = randomCategoryList.sort(() => 0.5 - Math.random());
        return shuffledCategories.slice(0, 11);
    };



    function sendErrorAlert() {
        showAlert(
            <span>
                <span className="text-red-500 font-bold text-xl">Connection to Websockets failed.</span><br/>
                <span className="text-gray-900 font-semibold"> If you are using an adblocker please disable it and refresh the page. Otherwise try again.</span>
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
                className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl"
            >
                <div className="grid grid-cols-1 md:grid-cols-3">
                    {/* Main Content (spans two columns on medium+ screens) */}
                    <div className="col-span-2 p-10">
                        <h1 className="text-5xl font-extrabold text-gray-900 text-center">
                            Artificially {randomAdjective} Jeopardy
                        </h1>
                        <p className="text-xl text-gray-700 text-center mt-4">
                            Try to answer with the correct question.
                        </p>

                        {/* Featured Category Card */}
                        <div className="mt-8">
                            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-2xl font-semibold text-gray-800 text-center mb-2">
                                    Featured Category
                                </h3>
                                <p className="text-xl font-bold text-gray-900 text-center">
                                    {cotd.category}
                                </p>
                                <p className="text-lg text-gray-600 text-center">
                                    {cotd.description}
                                </p>
                            </div>
                        </div>

                        {/* Create & Join Game Section */}
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Create Game Box */}
                            <div className="flex flex-col justify-center items-center bg-gray-50 p-6 rounded-lg border-gray-200 shadow">
                                <h3 className="text-2xl font-semibold text-gray-800 text-center mb-4">
                                    Create a Game
                                </h3>
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
                                <h3 className="text-2xl font-semibold text-gray-800 text-center mb-4">
                                    Join a Game
                                </h3>
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
                                    Welcome to AI Jeopardy! This is a new project so please be patient.
                                </p>
                                <ul className="list-disc ml-6 mt-4 text-lg text-gray-700">
                                    <li> To create a game you will first need to make an account in the top right.</li>
                                    <li> You don't need an account to join a game as a guest. Just insert the code your friend gave you above.</li>
                                    <li> Consider creating an account to customize your profile, create games, and more!</li>
                                    <li> Once you're in a lobby, select categories that you want to have questions generated for.</li>
                                    <li> If you're the host, press the "Start Game" button to begin! Otherwise wait for the host to begin.</li>
                                    <li> The host controls the game, once they are done reading the prompt they unlock the buzzer and the players race to buzz in if they know the answer.</li>
                                    <li> Have fun and enjoy the game!</li>
                                </ul>
                            </details>
                        </div>
                        {/* How to Play Section */}
                        <div className="mt-8">
                            <details className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow" open>
                                <summary className="text-2xl font-semibold text-gray-800 cursor-pointer">
                                    About Models
                                </summary>
                                <p className="mt-4 text-lg text-gray-700">

                                    <span className="text-xl text-bold text-red-500">
                                        The model options are currently locked as tokens are not yet implemented.
                                        Please choose from the available free models.
                                    </span><br/>
                                    <span className="mb-t text-lg text-bold text-gray-700">
                                        The host is shown a model section field, for the most part you can leave this as is.
                                        However, if you want to change the model you can do so by clicking the dropdown and selecting a model from the list.
                                        The use of some of these models is quite expensive, some of them cost tokens.
                                    </span>
                                </p>
                            </details>
                        </div>
                    </div>

                    {/* Sponsored/Banner Ad Column */}
                    <div className="p-10 bg-gray-100 border-l border-gray-200 flex">
                        <div className="w-full text-center">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Sponsored</h2>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
