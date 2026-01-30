import { models } from '../../../shared/models.js';
import { useProfile } from "../../contexts/ProfileContext.tsx";
import React from "react";
import type { LobbySettings } from "../../hooks/lobby/useLobbySocketSync.tsx";

type ReasoningEffortSetting = "off" | "low" | "medium" | "high";

interface Model {
    value: string;
    label: string;
    price: number;
    disabled: boolean;
}

interface HostControlsProps {
    lobbySettings: LobbySettings | null;
    updateLobbySettings: (patch: Partial<LobbySettings>) => void;

    isSoloLobby: boolean;

    boardJsonError: string | null;
    setBoardJsonError: (value: string | null) => void;
    tryValidateBoardJson: (raw: string) => string | null;

    onCreateGame: () => void;
}

const HostControls: React.FC<HostControlsProps> = ({
                                                       lobbySettings,
                                                       updateLobbySettings,
                                                       isSoloLobby,
                                                       boardJsonError,
                                                       setBoardJsonError,
                                                       tryValidateBoardJson,
                                                       onCreateGame,
                                                   }) => {
    const { profile } = useProfile();

    // Server-authoritative settings (hydrated from lobby snapshot)
    const selectedModel = lobbySettings?.selectedModel ?? "gpt-5.2";
    const timeToBuzz = lobbySettings?.timeToBuzz ?? 10;
    const timeToAnswer = lobbySettings?.timeToAnswer ?? 10;
    const visualMode = lobbySettings?.visualMode ?? "off";
    const reasoningEffort = lobbySettings?.reasoningEffort ?? "off";
    const boardJson = lobbySettings?.boardJson ?? "";

    const onModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateLobbySettings({ selectedModel: e.target.value });
    };

    const setTimeToBuzz = (time: number) => {
        updateLobbySettings({ timeToBuzz: time });
    };

    const setTimeToAnswer = (time: number) => {
        updateLobbySettings({ timeToAnswer: time });
    };

    const setVisualMode = (value: "off" | "commons" | "brave") => {
        updateLobbySettings({ visualMode: value });
    };

    const setReasoningEffort = (value: "off" | "low" | "medium" | "high") => {
        updateLobbySettings({ reasoningEffort: value });
    };

    const setBoardJson = (value: string) => {
        updateLobbySettings({ boardJson: value });
    };


    const selectedModelDef = models.find(m => m.value === selectedModel);
    const modelSupportsReasoningEffort = selectedModelDef?.supportsReasoningEffort === true;

    const usingImportedBoard = boardJson.trim().length > 0;

    const canUseBrave = profile?.role === "admin" || profile?.role === "privileged";

    const isReasoningLevelLocked = (level: ReasoningEffortSetting) => {
        if (level === "off" || level === "low") return false;
        return !(profile?.role === "admin" || profile?.role === "privileged");
    };

    // Group the models by price
    const groupedModels = models.reduce((groups, model) => {
        if (!groups[model.price]) groups[model.price] = [];
        groups[model.price].push(model);
        return groups;
    }, {} as Record<number, Model[]>);

    function checkCantUseModel(model: Model) {
        if (model.price === 0) return false;
        const role = profile?.role;
        return !(role === "admin" || role === "privileged");
    }

    const handleTimeChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        updateTime: (time: number) => void
    ) => {
        const value = parseInt(e.target.value);
        if (isNaN(value)) return;

        const clampedValue = Math.min(Math.max(value, 5), 60);
        updateTime(clampedValue);
    };

    const handlePasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setBoardJson(text);
            setBoardJsonError(tryValidateBoardJson(text));
        } catch (err) {
            // Clipboard can fail if not HTTPS / permission denied
            console.error("Clipboard paste failed:", err);
            // Keep it simple: user can still Ctrl+V
            setBoardJsonError("Could not read clipboard (permission denied or insecure context). Try Ctrl+V.");
        }
    };

    return (
        <div className="w-full">
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Left: Custom Board JSON */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-800">
                                Custom Board (Copy/Paste JSON)
                            </h3>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePasteFromClipboard}
                                    className="px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                                >
                                    Paste
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setBoardJson("");
                                        setBoardJsonError(null);
                                    }}
                                    className="px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">
                            Paste a saved board JSON to skip AI generation. Leave empty to use categories + AI.
                        </p>

                        <textarea
                            value={boardJson}
                            onChange={(e) => {
                                const next = e.target.value;
                                setBoardJson(next);
                                setBoardJsonError(tryValidateBoardJson(next));
                            }}
                            className="w-full h-40 p-3 rounded border border-gray-300 font-mono text-sm text-black bg-white"
                            placeholder='Paste board JSON here... (must include firstBoard, secondBoard, finalJeopardy)'
                        />

                        {boardJsonError && boardJson.trim().length > 0 && (
                            <div className="mt-2 text-sm text-red-600">{boardJsonError}</div>
                        )}
                    </div>

                    {/* Right: Settings + Start */}
                    <div className="w-full lg:w-[22rem] flex-shrink-0">
                        <div className="flex flex-col gap-4">
                            {/* Game Settings */}
                            <div className="rounded border border-gray-200 bg-white p-3">
                                <div className="text-gray-800 text-lg font-semibold mb-2">
                                    Game Settings
                                </div>

                                <div className={isSoloLobby ? "opacity-50 pointer-events-none" : ""}>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-gray-800">Time to Buzz:</label>
                                            <div className="flex flex-wrap gap-2 items-center">
                                                <input
                                                    type="number"
                                                    min="5"
                                                    max="60"
                                                    value={timeToBuzz === -1 ? "" : timeToBuzz}
                                                    onChange={(e) => handleTimeChange(e, setTimeToBuzz)}
                                                    disabled={timeToBuzz === -1}
                                                    placeholder="5-60"
                                                    className={`p-2 rounded border border-gray-300 text-black w-24 ${
                                                        timeToBuzz === -1 ? "bg-gray-100" : "bg-white"
                                                    }`}
                                                />
                                                <span className="text-gray-600">seconds</span>

                                                <div className="flex items-center ml-2">
                                                    <input
                                                        type="checkbox"
                                                        id="infiniteTime"
                                                        checked={timeToBuzz === -1}
                                                        onChange={() => setTimeToBuzz(timeToBuzz === -1 ? 30 : -1)}
                                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                    />
                                                    <label htmlFor="infiniteTime" className="ml-2 text-gray-700">
                                                        Infinite
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <label className="text-gray-800">Time to Answer:</label>
                                            <div className="flex flex-wrap gap-2 items-center">
                                                <input
                                                    type="number"
                                                    min="5"
                                                    max="60"
                                                    value={timeToAnswer === -1 ? "" : timeToAnswer}
                                                    onChange={(e) => handleTimeChange(e, setTimeToAnswer)}
                                                    disabled={timeToAnswer === -1}
                                                    placeholder="5-60"
                                                    className={`p-2 rounded border border-gray-300 text-black w-24 ${
                                                        timeToAnswer === -1 ? "bg-gray-100" : "bg-white"
                                                    }`}
                                                />
                                                <span className="text-gray-600">seconds</span>

                                                <div className="flex items-center ml-2">
                                                    <input
                                                        type="checkbox"
                                                        id="infiniteTime2"
                                                        checked={timeToAnswer === -1}
                                                        onChange={() => setTimeToAnswer(timeToAnswer === -1 ? 30 : -1)}
                                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                    />
                                                    <label htmlFor="infiniteTime2" className="ml-2 text-gray-700">
                                                        Infinite
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Model Settings */}
                            <div
                                className={`rounded border border-gray-200 bg-white p-3 ${
                                    usingImportedBoard ? "opacity-50 pointer-events-none" : ""
                                }`}
                            >
                                <div className="text-gray-800 text-lg font-semibold mb-2">
                                    Model Settings
                                </div>

                                {usingImportedBoard && (
                                    <div className="text-sm text-gray-600 mb-2">
                                        Model settings are disabled because pasted board JSON will be used.
                                    </div>
                                )}

                                <div className="flex flex-col gap-2">
                                    <label className="text-gray-800">Model Selection:</label>
                                    <select
                                        value={selectedModel}
                                        onChange={onModelChange}
                                        disabled={usingImportedBoard}
                                        className="p-2 rounded border border-gray-300 text-black w-full bg-white cursor-pointer"
                                    >
                                        {Object.entries(groupedModels).map(([price, models]) => (
                                            <optgroup
                                                key={price}
                                                label={price === "0" ? "Free Models" : "Premium Models"}
                                            >
                                                {models.map((model) => (
                                                    <option
                                                        key={model.value}
                                                        value={model.value}
                                                        disabled={checkCantUseModel(model)}
                                                    >
                                                        {model.label}
                                                        {model.price > 0 &&
                                                        !(profile?.role === "admin" || profile?.role === "privileged")
                                                            ? " (Locked)"
                                                            : ""}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                {/* Reasoning Effort - Only shown if supported and not using an imported board */}
                                {modelSupportsReasoningEffort && !usingImportedBoard && (
                                    <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-gray-100">
                                        <label className="text-sm font-medium text-gray-700">Reasoning Effort</label>

                                        <div className="flex p-1 bg-gray-100 rounded-lg w-full gap-1">
                                            {(["off", "low", "medium", "high"] as ReasoningEffortSetting[]).map((level) => {
                                                const locked = isReasoningLevelLocked(level);
                                                return (
                                                    <button
                                                        key={level}
                                                        type="button"
                                                        disabled={locked}
                                                        onClick={() => setReasoningEffort(level)}
                                                        className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 flex flex-col items-center justify-center ${
                                                            reasoningEffort === level
                                                                ? "bg-white text-blue-600 shadow-sm"
                                                                : locked
                                                                    ? "text-gray-400 cursor-not-allowed opacity-60"
                                                                    : "text-gray-500 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        <span>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
                                                        {locked && <span className="text-[8px] uppercase font-bold text-gray-400">Locked</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col gap-2 mt-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="includeVisualsCommons"
                                            checked={visualMode === "commons"}
                                            onChange={(e) => setVisualMode(e.target.checked ? "commons" : "off")}
                                            disabled={usingImportedBoard}
                                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="includeVisualsCommons" className="text-gray-700">
                                            Enable Visual Clues (Wikimedia Commons)
                                        </label>
                                    </div>

                                    {canUseBrave && (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="includeVisualsBrave"
                                                checked={visualMode === "brave"}
                                                onChange={(e) => setVisualMode(e.target.checked ? "brave" : "off")}
                                                disabled={usingImportedBoard}
                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <label htmlFor="includeVisualsBrave" className="text-gray-700">
                                                Enable Visual Clues (Brave Image Search)
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={onCreateGame}
                                className="text-xl px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer w-full shadow-md hover:bg-blue-500 transition"
                            >
                                Start Game
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HostControls;