import { models } from '../../../shared/models.js';
import { useProfile } from "../../contexts/ProfileContext.tsx";

interface Model {
    value: string;
    label: string;
    price: number;
    disabled: boolean;
}

interface HostControlsProps {
    selectedModel: string;
    timeToBuzz: number;
    timeToAnswer: number;
    isSoloLobby: boolean;

    boardJson: string;
    setBoardJson: (value: string) => void;
    boardJsonError: string | null;
    setBoardJsonError: (value: string | null) => void;
    tryValidateBoardJson: (raw: string) => string | null;

    onModelChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    setTimeToBuzz: (time: number) => void;
    setTimeToAnswer: (time: number) => void;
    onCreateGame: () => void;
    includeVisuals: boolean;
    setIncludeVisuals: (value: boolean) => void;
}

const HostControls: React.FC<HostControlsProps> = ({
                                                       selectedModel,
                                                       timeToBuzz,
                                                       timeToAnswer,
                                                       isSoloLobby,
                                                       boardJson,
                                                       setBoardJson,
                                                       boardJsonError,
                                                       setBoardJsonError,
                                                       tryValidateBoardJson,
                                                       onModelChange,
                                                       setTimeToBuzz,
                                                       setTimeToAnswer,
                                                       onCreateGame,
                                                       includeVisuals,
                                                       setIncludeVisuals,
                                                   }) => {
    const { profile } = useProfile();
    // Group the models by price
    const groupedModels = models.reduce((groups, model) => {
        if (!groups[model.price]) {
            groups[model.price] = [];
        }
        groups[model.price].push(model);
        return groups;
    }, {} as Record<number, Model[]>);

    function checkCantUseModel(model: Model) {
        // Free models are always available
        if (model.price === 0) return false;

        // Paid models: only admin/privileged
        const role = profile?.role;
        return !(role === "admin" || role === "privileged");
    }


    const handleTimeChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        updateTime: (time: number) => void
    ) => {
        const value = parseInt(e.target.value);
        if (isNaN(value)) return;

        // Clamp value between 5 and 60
        const clampedValue = Math.min(Math.max(value, 5), 60);
        updateTime(clampedValue);
    };


    return (
        <div className="w-full">
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Left: Custom Board JSON */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-800">Custom Board (Copy/Paste JSON)</h3>
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
                            <div className="mt-2 text-sm text-red-600">
                                {boardJsonError}
                            </div>
                        )}
                    </div>

                    {/* Right: Options + Start */}
                    <div className="w-full lg:w-[22rem] flex-shrink-0">
                        <div className="flex flex-col gap-4">
                            {/* Model */}
                            <div className="flex flex-col gap-2">
                                <label className="text-gray-800 text-lg">Model Selection:</label>
                                <select
                                    value={selectedModel}
                                    onChange={onModelChange}
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
                                                    {model.price > 0 && !(profile?.role === "admin" || profile?.role === "privileged")
                                                        ? " (Locked)"
                                                        : ""}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            {/* Timers */}
                            <div className={isSoloLobby ? "opacity-50 pointer-events-none" : ""}>
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-gray-800 text-lg">Time to Buzz:</label>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            <input
                                                type="number"
                                                min="5"
                                                max="60"
                                                value={timeToBuzz === -1 ? '' : timeToBuzz}
                                                onChange={(e) => handleTimeChange(e, setTimeToBuzz)}
                                                disabled={timeToBuzz === -1}
                                                placeholder="5-60"
                                                className={`p-2 rounded border border-gray-300 text-black w-24 ${
                                                    timeToBuzz === -1 ? 'bg-gray-100' : 'bg-white'
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
                                        <label className="text-gray-800 text-lg">Time to Answer:</label>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            <input
                                                type="number"
                                                min="5"
                                                max="60"
                                                value={timeToAnswer === -1 ? '' : timeToAnswer}
                                                onChange={(e) => handleTimeChange(e, setTimeToAnswer)}
                                                disabled={timeToAnswer === -1}
                                                placeholder="5-60"
                                                className={`p-2 rounded border border-gray-300 text-black w-24 ${
                                                    timeToAnswer === -1 ? 'bg-gray-100' : 'bg-white'
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
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="includeVisuals"
                                    checked={includeVisuals}
                                    onChange={(e) => setIncludeVisuals(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="includeVisuals" className="text-gray-700">
                                    Enable Visual Clues (Wikimedia Commons)
                                </label>
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