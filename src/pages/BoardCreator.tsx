import { useMemo, useState } from "react";
import PageCardContainer from "../components/common/PageCardContainer.tsx";
import type { BoardData } from "../../shared/types/board.ts";
import {
  boardToPrettyJson,
  cloneBoard,
  makeTemplateBoard,
  parseBoardFromJson,
  validateBoard,
} from "../features/boardCreator/boardCreatorUtils.ts";

export default function BoardCreator() {
  const [board, setBoard] = useState<BoardData>(() => makeTemplateBoard());
  const [jsonInput, setJsonInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);

  const outputJson = useMemo(() => boardToPrettyJson(board), [board]);

  const setRoundCategory = (
    round: "firstBoard" | "secondBoard" | "finalJeopardy",
    categoryIndex: number,
    nextName: string,
  ) => {
    setBoard((prev) => {
      const next = cloneBoard(prev);
      next[round].categories[categoryIndex].category = nextName;
      return next;
    });
  };

  const setClueField = (
    round: "firstBoard" | "secondBoard" | "finalJeopardy",
    categoryIndex: number,
    clueIndex: number,
    field: "value" | "question" | "answer",
    value: string,
  ) => {
    setBoard((prev) => {
      const next = cloneBoard(prev);
      const clue = next[round].categories[categoryIndex].values[clueIndex];
      if (field === "value") clue.value = Number(value);
      if (field === "question") clue.question = value;
      if (field === "answer") clue.answer = value;
      return next;
    });
  };

  const runValidation = () => {
    const result = validateBoard(board);
    if (!result.ok) {
      setStatus(result.error);
      setStatusError(true);
      return;
    }
    setStatus("Board JSON looks valid for import.");
    setStatusError(false);
  };

  const loadFromJson = () => {
    const parsed = parseBoardFromJson(jsonInput);
    if (!parsed.ok) {
      setStatus(parsed.error);
      setStatusError(true);
      return;
    }
    const valid = validateBoard(parsed.board);
    if (!valid.ok) {
      setStatus(valid.error);
      setStatusError(true);
      return;
    }
    setBoard(parsed.board);
    setStatus("Loaded board JSON into editor.");
    setStatusError(false);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(outputJson);
      setStatus("Copied board JSON.");
      setStatusError(false);
    } catch {
      setStatus("Could not copy to clipboard.");
      setStatusError(true);
    }
  };

  const downloadJson = () => {
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "board.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded board.json");
    setStatusError(false);
  };

  return (
    <div className="min-h-screen px-4 py-6 md:px-6">
      <PageCardContainer className="mx-auto">
        <div className="mx-auto w-full max-w-6xl p-6 md:p-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">Board Creator</h1>
          <p className="mt-3 text-slate-700 text-base md:text-lg">
            Build your own board JSON and paste it into lobby advanced settings.
          </p>

          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Load Existing JSON</p>
              <textarea
                className="mt-2 h-40 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400"
                placeholder="Paste board JSON here..."
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              />
              <button
                onClick={loadFromJson}
                className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Load Into Editor
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runValidation}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Validate
                </button>
                <button
                  onClick={copyJson}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Copy JSON
                </button>
                <button
                  onClick={downloadJson}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Download JSON
                </button>
                <button
                  onClick={() => {
                    setBoard(makeTemplateBoard());
                    setStatus("Reset to starter template.");
                    setStatusError(false);
                  }}
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Reset Template
                </button>
              </div>
              {status ? (
                <p className={`mt-3 text-sm ${statusError ? "text-rose-700" : "text-emerald-700"}`}>
                  {status}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {(["firstBoard", "secondBoard"] as const).map((roundKey) => (
                <div key={roundKey} className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {roundKey === "firstBoard" ? "Jeopardy!" : "Double Jeopardy"}
                  </h2>
                  <div className="mt-3 space-y-4">
                    {board[roundKey].categories.map((cat, catIndex) => (
                      <div
                        key={`${roundKey}-${catIndex}`}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <input
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400"
                          value={cat.category}
                          onChange={(e) => setRoundCategory(roundKey, catIndex, e.target.value)}
                        />
                        <div className="mt-2 grid gap-2">
                          {cat.values.map((clue, clueIndex) => (
                            <div
                              key={`${roundKey}-${catIndex}-${clueIndex}`}
                              className="grid gap-2 md:grid-cols-12"
                            >
                              <input
                                type="number"
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 md:col-span-2"
                                value={clue.value}
                                onChange={(e) =>
                                  setClueField(
                                    roundKey,
                                    catIndex,
                                    clueIndex,
                                    "value",
                                    e.target.value,
                                  )
                                }
                              />
                              <input
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 md:col-span-5"
                                value={clue.question}
                                onChange={(e) =>
                                  setClueField(
                                    roundKey,
                                    catIndex,
                                    clueIndex,
                                    "question",
                                    e.target.value,
                                  )
                                }
                              />
                              <input
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 md:col-span-5"
                                value={clue.answer}
                                onChange={(e) =>
                                  setClueField(
                                    roundKey,
                                    catIndex,
                                    clueIndex,
                                    "answer",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">Final Jeopardy</h2>
              <div className="mt-3 space-y-2">
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400"
                  value={board.finalJeopardy.categories[0].category}
                  onChange={(e) => setRoundCategory("finalJeopardy", 0, e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400"
                  value={board.finalJeopardy.categories[0].values[0].question}
                  onChange={(e) => setClueField("finalJeopardy", 0, 0, "question", e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400"
                  value={board.finalJeopardy.categories[0].values[0].answer}
                  onChange={(e) => setClueField("finalJeopardy", 0, 0, "answer", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </PageCardContainer>
    </div>
  );
}
