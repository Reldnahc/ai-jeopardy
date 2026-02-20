import { Link } from "react-router-dom";
import { useState } from "react";
import { Board } from "../../types/Board.ts";
import CollapsibleCategory from "./CollapsibleCategory.tsx";

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

  const onCopyJson = async () => {
    const ok = await copyTextToClipboard(JSON.stringify(game, null, 2));
    if (!ok) return;

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 shadow-md rounded-lg p-6 mb-8">
      <div className="mb-4 border-b pb-2 flex items-start justify-between gap-4">
        <div>
          {/* Host with Link */}
          <p className="text-xl font-semibold text-gray-800">
            Host:{" "}
            <Link
              to={`/profile/${game.host.toLowerCase()}`}
              className="text-blue-600 hover:underline font-normal transition"
            >
              {game.host}
            </Link>
          </p>
          {/* Model */}
          <p className="text-xl font-semibold text-gray-800">
            Model: <span className="font-normal">{game.model}</span>
          </p>
        </div>

        <button
          onClick={onCopyJson}
          className={`px-3 py-2 rounded-md text-sm font-semibold shadow-sm transition ${
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
        <h2 className="text-2xl font-bold mb-3 text-gray-800">First Board</h2>
        {game.firstBoard?.categories.map((cat, idx) => (
          <CollapsibleCategory key={idx} category={cat.category} values={cat.values} />
        ))}
      </div>

      {/* Second Board */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-3 text-gray-800">Second Board</h2>
        {game.secondBoard?.categories.map((cat, idx) => (
          <CollapsibleCategory key={idx} category={cat.category} values={cat.values} />
        ))}
      </div>

      {/* Final Jeopardy */}
      <div>
        <h2 className="text-2xl font-bold mb-3 text-gray-800">Final Jeopardy</h2>
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
