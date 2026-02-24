import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../../../contexts/ProfileContext.tsx";
import Avatar from "../../../components/common/Avatar.tsx";
import { getProfilePresentation } from "../../../utils/profilePresentation";

interface FinalScoreScreenProps {
  scores: Record<string, number>;
}

type ScoreEntry = {
  username: string;
  score: number;
};

const FinalScoreScreen = ({ scores }: FinalScoreScreenProps) => {
  const navigate = useNavigate();
  const { getProfileByUsername, fetchPublicProfiles } = useProfile();

  const sortedScores = useMemo<ScoreEntry[]>(() => {
    return Object.entries(scores)
      .map(([username, score]) => ({ username, score }))
      .sort((a, b) => b.score - a.score);
  }, [scores]);

  const usernames = useMemo(
    () =>
      sortedScores.map((entry) => entry.username.trim()).filter((username) => username.length > 0),
    [sortedScores],
  );

  useEffect(() => {
    if (usernames.length === 0) return;
    void fetchPublicProfiles(usernames).catch(() => {});
  }, [fetchPublicProfiles, usernames]);

  const topScore = sortedScores[0]?.score ?? 0;
  const winnerCount = sortedScores.filter((entry) => entry.score === topScore).length;

  const rankTone = (index: number) => {
    if (index === 0) return "from-amber-300/60 to-yellow-400/60 border-amber-200/90";
    if (index === 1) return "from-slate-200/45 to-slate-100/35 border-slate-200/80";
    if (index === 2) return "from-orange-300/45 to-orange-200/35 border-orange-200/80";
    return "from-white/15 to-white/5 border-white/20";
  };

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 md:px-8 md:py-8 text-white">
      <div className="mx-auto w-full max-w-5xl rounded-xl border border-white/20 bg-[#0e2f63]/80 p-4 md:p-6 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/20 pb-4">
          <div>
            <h1 className="font-swiss911 text-5xl md:text-6xl tracking-wide text-yellow-300 text-shadow-jeopardy">
              Final Results
            </h1>
            <p className="mt-1 text-sm md:text-base text-blue-100/90">
              {winnerCount > 1 ? `${winnerCount} players tied for first` : "Champion crowned"}
            </p>
          </div>

          <div className="flex gap-2 md:gap-3">
            <div className="rounded-lg border border-yellow-200/40 bg-yellow-300/15 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-yellow-100/80">
                Top Score
              </div>
              <div className="font-swiss911 text-2xl leading-none text-yellow-200">
                ${topScore.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {sortedScores.map((entry, index) => {
            const profile = getProfileByUsername(entry.username);
            const pres = getProfilePresentation({
              profile,
              fallbackName: entry.username,
              defaultNameColor: "#f8fafc",
            });
            const isChampion = index === 0 && winnerCount === 1;

            return (
              <div
                key={entry.username}
                className={`relative flex items-center gap-3 rounded-lg border bg-gradient-to-r px-3 py-2.5 md:px-4 md:py-3 ${rankTone(index)}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/30 font-swiss911 text-xl leading-none text-white md:h-9 md:w-9 md:text-2xl">
                  {index + 1}
                </div>

                <Avatar
                  name={pres.avatar.nameForLetter}
                  size="9"
                  color={pres.avatar.bgColor}
                  textColor={pres.avatar.fgColor}
                  icon={pres.avatar.icon}
                />

                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-lg leading-none md:text-xl ${pres.nameClassName}`}
                    style={pres.nameStyle}
                    title={pres.displayName}
                  >
                    {pres.displayName}
                  </div>
                  {pres.displayName !== entry.username && (
                    <div className="mt-0.5 truncate text-xs text-slate-100/75">
                      {entry.username}
                    </div>
                  )}
                </div>

                <div
                  className={`shrink-0 font-swiss911 text-3xl leading-none md:text-4xl ${entry.score < 0 ? "text-red-200" : "text-green-200"}`}
                >
                  ${entry.score.toLocaleString()}
                </div>

                {isChampion && (
                  <div className="absolute -top-3.5 right-3 rounded-md border border-yellow-200 bg-yellow-300 px-3 py-1 font-swiss911 text-sm tracking-wide text-[#3f2a00]">
                    Champion
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => navigate("/")}
            className="rounded-lg border border-white/25 bg-white/15 px-6 py-2.5 font-swiss911 text-2xl tracking-wide text-white transition hover:bg-white/25"
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinalScoreScreen;

