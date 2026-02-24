import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Board } from "../../types/Board.ts";
import CollapsibleCategory from "./CollapsibleCategory.tsx";
import { modelsByValue } from "../../../shared/models.js";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import { getProfilePresentation } from "../../utils/profilePresentation.ts";
import { copyTextToClipboard } from "../../utils/clipboardUtils.ts";

type GameCardProps = {
  game: Board;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

const GameCard = ({ game, collapsible = false, defaultCollapsed = false }: GameCardProps) => {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { getProfileByUsername, fetchPublicProfile } = useProfile();
  const modelLabel = modelsByValue[String(game.model)]?.label ?? String(game.model ?? "");
  const hostUsername = String(game.host ?? "")
    .trim()
    .toLowerCase();
  const hostProfile = getProfileByUsername(hostUsername);
  const hostPres = getProfilePresentation({
    profile: hostProfile,
    fallbackName: game.host,
    defaultNameColor: "#1d4ed8",
  });
  const createdAtDate =
    typeof game.createdAt === "string" && game.createdAt.trim() ? new Date(game.createdAt) : null;
  const createdAtValid = createdAtDate instanceof Date && !Number.isNaN(createdAtDate.getTime());
  const createdAtLabel = createdAtValid
    ? createdAtDate.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const onCopyJson = async () => {
    const ok = await copyTextToClipboard(JSON.stringify(game, null, 2));
    if (!ok) return;

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  useEffect(() => {
    if (!hostUsername) return;
    if (hostProfile) return;
    void fetchPublicProfile(hostUsername).catch(() => {});
  }, [fetchPublicProfile, hostProfile, hostUsername]);

  const sections = [
    {
      key: "jeopardy",
      title: "Jeopardy!",
      categories: game.firstBoard?.categories ?? [],
    },
    {
      key: "double-jeopardy",
      title: "Double Jeopardy!",
      categories: game.secondBoard?.categories ?? [],
    },
    {
      key: "final-jeopardy",
      title: "Final Jeopardy!",
      categories: (game.finalJeopardy?.categories ?? []).map((cat) => ({
        category: cat.category,
        values: cat.values.map((value) => ({
          value: 0,
          question: value.question,
          answer: value.answer,
        })),
      })),
    },
  ];

  const showBoard = !collapsible || !isCollapsed;

  return (
    <article className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-[#11336d] via-[#1f4f9b] to-[#143a7c] p-3 md:p-4">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-blue-100">
              <span className="font-semibold">Generator:</span>
              <Link
                to={`/profile/${hostUsername}`}
                className={`text-base font-semibold hover:underline ${hostPres.nameClassName}`}
                style={hostPres.nameStyle}
              >
                {hostPres.displayName}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-blue-100">
              <span className="font-semibold">Model:</span>
              <span>{modelLabel}</span>
            </div>

            {createdAtLabel && (
              <p className="text-sm text-blue-200">
                <span className="font-semibold">Created:</span> {createdAtLabel}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCopyJson}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              }`}
              aria-label="Copy board JSON to clipboard"
              type="button"
            >
              {copied ? "Copied!" : "Copy JSON"}
            </button>

            {collapsible && (
              <button
                onClick={() => setIsCollapsed((prev) => !prev)}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100"
                type="button"
              >
                {isCollapsed ? "Expand" : "Collapse"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showBoard && (
        <div className="space-y-6 px-4 pb-4 md:px-5 md:pb-5">
          {sections.map((section) => (
            <section key={section.key}>
              <h2 className="mb-3 text-xl font-semibold text-slate-800">{section.title}</h2>
              <div className="space-y-2">
                {section.categories.map((cat, idx) => (
                  <CollapsibleCategory key={`${section.key}-${idx}`} category={cat.category} values={cat.values} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
};

export default GameCard;
