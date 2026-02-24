type GameActionsSectionProps = {
  gameId: string;
  isCreatingLobby: boolean;
  onGameIdChange: (value: string) => void;
  onCreateGame: () => void | Promise<void>;
  onJoinGame: () => void | Promise<void>;
};

export default function GameActionsSection({
  gameId,
  isCreatingLobby,
  onGameIdChange,
  onCreateGame,
  onJoinGame,
}: GameActionsSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
      <div className="flex flex-col justify-center items-center bg-gradient-to-br from-emerald-50 to-green-50 p-5 md:p-6 rounded-2xl border border-emerald-200/80 shadow-sm">
        <div className="mb-3 w-full text-left text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Start a New Match
        </div>
        <button
          onClick={onCreateGame}
          disabled={isCreatingLobby}
          aria-busy={isCreatingLobby}
          className="w-full h-full py-3 px-6 text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-lg md:text-xl rounded-lg font-semibold transition-colors duration-200 shadow-md"
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
              <span>Creatingâ€¦</span>
            </span>
          ) : (
            "Create Game"
          )}
        </button>

        {isCreatingLobby && (
          <p className="mt-3 text-sm text-gray-600 text-center">
            Creating lobbyâ€¦ this can take a few seconds.
          </p>
        )}
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 md:p-6 rounded-2xl border border-blue-200/80 shadow-sm">
        <div className="mb-3 w-full text-left text-sm font-semibold uppercase tracking-wide text-blue-700">
          Join Existing Lobby
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label htmlFor="gameId" className="text-lg font-medium text-slate-800">
              Game ID:
            </label>
            <input
              id="gameId"
              type="text"
              value={gameId}
              onChange={(e) => onGameIdChange(e.target.value)}
              placeholder="Enter Game ID to join"
              className="mt-2 p-3 border border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={onJoinGame}
            disabled={isCreatingLobby}
            aria-busy={isCreatingLobby}
            className="py-3 px-6 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold rounded-lg transition-colors duration-200 shadow-md"
          >
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
}

