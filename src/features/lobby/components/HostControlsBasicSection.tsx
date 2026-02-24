import React from "react";

interface HostControlsBasicSectionProps {
  timeToBuzz: number;
  timeToAnswer: number;
  onTimeToBuzzChange: (time: number) => void;
  onTimeToAnswerChange: (time: number) => void;
  onCreateGame: () => void;
}

const HostControlsBasicSection: React.FC<HostControlsBasicSectionProps> = ({
  timeToBuzz,
  timeToAnswer,
  onTimeToBuzzChange,
  onTimeToAnswerChange,
  onCreateGame,
}) => {
  const handleTimeChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    updateTime: (time: number) => void,
  ) => {
    const value = parseInt(e.target.value);
    if (isNaN(value)) return;

    const clampedValue = Math.min(Math.max(value, 5), 60);
    updateTime(clampedValue);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <div className="text-gray-900 text-lg font-semibold">Game Settings</div>
              <div className="text-sm text-gray-500">Timers for buzzing and answering.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block text-sm font-medium text-gray-800 mb-2">Time to Buzz</label>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={timeToBuzz === -1 ? "" : timeToBuzz}
                  onChange={(e) => handleTimeChange(e, onTimeToBuzzChange)}
                  disabled={timeToBuzz === -1}
                  placeholder="5-60"
                  className={`p-2 rounded-md border border-gray-300 text-black w-28 ${
                    timeToBuzz === -1 ? "bg-gray-100" : "bg-white"
                  }`}
                />
                <span className="text-gray-600 text-sm">seconds</span>
              </div>

              <div className="mt-2 text-xs text-gray-500">How long contestants have to buzz in.</div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Time to Answer
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={timeToAnswer === -1 ? "" : timeToAnswer}
                  onChange={(e) => handleTimeChange(e, onTimeToAnswerChange)}
                  disabled={timeToAnswer === -1}
                  placeholder="5-60"
                  className={`p-2 rounded-md border border-gray-300 text-black w-28 ${
                    timeToAnswer === -1 ? "bg-gray-100" : "bg-white"
                  }`}
                />
                <span className="text-gray-600 text-sm">seconds</span>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                How long the buzzed player has to respond.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 h-full flex flex-col justify-between">
          <div>
            <div className="text-gray-900 text-lg font-semibold">Ready?</div>
            <div className="text-sm text-gray-500 mt-1">
              Start the game with the current lobby settings.
            </div>
          </div>

          <button
            onClick={onCreateGame}
            className="mt-4 w-full text-xl px-6 py-4 bg-blue-600 text-white rounded-xl cursor-pointer shadow-md hover:bg-blue-500 transition active:scale-[0.99]"
          >
            Start Game
          </button>

          <div className="mt-3" />
        </div>
      </div>
    </div>
  );
};

export default HostControlsBasicSection;
