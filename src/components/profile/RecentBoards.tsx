import type { Board } from "../../types/Board";
import ProfileGameCard from "./ProfileGameCard";

type Props = {
  boardsLoading: boolean;
  boards: Board[];
};

export default function RecentBoards({ boardsLoading, boards }: Props) {
  return (
    <div className="space-y-4">
      {boardsLoading ? (
        <p className="text-gray-600 italic">Loading boards…</p>
      ) : boards.length > 0 ? (
        boards.map((board, idx) => <ProfileGameCard key={idx} game={board} />)
      ) : (
        <p className="text-gray-600 italic">No boards generated yet.</p>
      )}
    </div>
  );
}
