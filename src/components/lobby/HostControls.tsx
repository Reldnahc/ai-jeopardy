import { models } from '../../../shared/models.js';
import { useProfile } from "../../contexts/ProfileContext.tsx";

interface Model {
    value: string;
    label: string;
    price: number;
    disabled: boolean;
    hideTemp?: boolean;
    presetTemp?: number;
}

interface HostControlsProps {
    selectedModel: string;
    temperature: number;
    timeToBuzz: number;
    timeToAnswer: number;
    isSoloLobby: boolean;
    onModelChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    setTemperature: (temp: number) => void;
    setTimeToBuzz: (time: number) => void;
    setTimeToAnswer: (time: number) => void;
    onCreateGame: () => void;
}

const HostControls: React.FC<HostControlsProps> = ({
                                                       selectedModel,
                                                       temperature,
                                                       timeToBuzz,
                                                       timeToAnswer,
                                                       isSoloLobby,
                                                       onModelChange,
                                                       setTemperature,
                                                       setTimeToBuzz,
                                                       setTimeToAnswer,
                                                       onCreateGame
                                                   }) => {
    const { profile } = useProfile();
    const selectedModelDef = models.find((m) => m.value === selectedModel);
    const hideTemp = Boolean(selectedModelDef?.hideTemp);

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
        // Wrapper container with responsive layout
        <div className="flex flex-col sm:flex-row justify-start mt-3 items-center pl-8 gap-5">

            {/* Options Box */}
            <div className="flex flex-col justify-center sm:mr-5">
                <div className="flex flex-col justify-center items-start bg-gray-50 px-20 py-5 rounded-lg border border-gray-300 shadow-md flex-shrink-0">
                    {/* Dropdown for model selection */}
                    <div className="flex flex-col gap-2 mb-3">
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

                    {/* Temperature Slider */}
                    {!hideTemp && (
                        <div className="flex flex-col gap-2 w-full mb-3">
                            <label className="text-gray-800 text-lg">
                                Temperature: {temperature.toFixed(2)}
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1.2"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}


                    <div className={isSoloLobby ? "opacity-50 pointer-events-none" : ""}>
                        <div className="flex flex-col gap-2 w-full">
                            <label className="text-gray-800 text-lg">Time to Buzz:</label>
                            <div className="flex gap-2 items-center">
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
                                        Infinite Time
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 w-full">
                            <label className="text-gray-800 text-lg">Time to Answer:</label>
                            <div className="flex gap-2 items-center">
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
                                        Infinite Time
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Start Game Button */}
            <button
                onClick={onCreateGame}
                className="text-2xl px-10 py-5 bg-blue-600 text-white rounded-lg cursor-pointer max-w-[500px] shadow-md hover:bg-blue-500 transition sm:ml-5 sm:mt-0 mt-5"
            >
                Start Game
            </button>
        </div>
    );
};

export default HostControls;