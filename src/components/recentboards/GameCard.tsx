import { Link } from "react-router-dom";
import { useState } from "react";
import { Board } from "../../types/Board.ts";
import CollapsibleCategory from "./CollapsibleCategory.tsx";
import { modelsByValue } from "../../../shared/models.js";

type GameCardProps = {
  game: Board;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for non-secure contexts
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

const GameCard = ({ game }: GameCardProps) => {
  const [copied, setCopied] = useState(false);
  const modelLabel = modelsByValue[String(game.model)]?.label ?? String(game.model ?? "");
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

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-[0_18px_35px_-24px_rgba(15,23,42,0.55)]">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          {/* Host with Link */}
          <p className="text-xl font-semibold text-slate-800">
            Host:{" "}
            <Link
              to={`/profile/${game.host.toLowerCase()}`}
              className="font-normal text-blue-600 transition hover:text-blue-700 hover:underline"
            >
              {game.host}
            </Link>
          </p>
          {/* Model */}
          <p className="text-xl font-semibold text-slate-800">
            Model: <span className="font-normal text-slate-700">{modelLabel}</span>
          </p>
          {createdAtLabel && (
            <p className="text-sm font-medium text-slate-600">
              Created: <span className="font-normal">{createdAtLabel}</span>
            </p>
          )}
        </div>

        <button
          onClick={onCopyJson}
          className={`rounded-md px-3 py-2 text-sm font-semibold shadow-sm transition ${
            copied ? "bg-green-600 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
          }`}
          aria-label="Copy board JSON to clipboard"
          type="button"
        >
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>

      {/* First Board */}
      <div className="mb-6">
        <h2 className="mb-3 text-2xl font-bold text-slate-800">Jeopardy!</h2>
        {game.firstBoard?.categories.map((cat, idx) => (
          <CollapsibleCategory key={idx} category={cat.category} values={cat.values} />
        ))}
      </div>

      {/* Second Board */}
      <div className="mb-6">
        <h2 className="mb-3 text-2xl font-bold text-slate-800">Double Jeopardy!</h2>
        {game.secondBoard?.categories.map((cat, idx) => (
          <CollapsibleCategory key={idx} category={cat.category} values={cat.values} />
        ))}
      </div>

      {/* Final Jeopardy */}
      <div>
        <h2 className="mb-3 text-2xl font-bold text-slate-800">Final Jeopardy!</h2>
        {game.finalJeopardy?.categories.map((cat, idx) => (
          <CollapsibleCategory
            key={idx}
            category={cat.category}
            values={cat.values.map((value) => ({
              value: 0,
              question: value.question,
              answer: value.answer,
            }))}
          />
        ))}
      </div>
    </div>
  );
};

export default GameCard;
