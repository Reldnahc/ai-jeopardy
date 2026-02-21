type Props = {
  boardsGenerated?: number | null;
  gamesFinished?: number | null;
  gamesWon?: number | null;
  moneyWon?: number | null;
};

export default function ProfileStatsGrid({
  boardsGenerated,
  gamesFinished,
  gamesWon,
  moneyWon,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-gray-100 p-4 rounded-lg shadow">
        <p className="text-gray-800">Boards Generated</p>
        <p className="text-lg font-semibold text-gray-900">{boardsGenerated ?? 0}</p>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg shadow">
        <p className="text-gray-800">Games Finished</p>
        <p className="text-lg font-semibold text-gray-900">{gamesFinished ?? 0}</p>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg shadow">
        <p className="text-gray-800">Games Won</p>
        <p className="text-lg font-semibold text-gray-900">{gamesWon ?? 0}</p>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg shadow">
        <p className="text-gray-800">Money Won</p>
        <p className="text-lg font-semibold text-gray-900">${(moneyWon ?? 0).toLocaleString()}</p>
      </div>
    </div>
  );
}
