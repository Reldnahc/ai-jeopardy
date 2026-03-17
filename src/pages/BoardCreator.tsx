import PageCardContainer from "../components/common/PageCardContainer.tsx";
import BoardCreatorRoundEditor from "../features/boardCreator/BoardCreatorRoundEditor.tsx";
import { useBoardCreatorState } from "../features/boardCreator/useBoardCreatorState.ts";

export default function BoardCreator() {
  const {
    board,
    jsonInput,
    setJsonInput,
    status,
    runValidation,
    loadFromJson,
    resetTemplate,
    copyJson,
    downloadJson,
    setRoundCategory,
    setClueField,
  } = useBoardCreatorState();

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
                  onClick={resetTemplate}
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Reset Template
                </button>
              </div>
              {status.message ? (
                <p className={`mt-3 text-sm ${status.isError ? "text-rose-700" : "text-emerald-700"}`}>
                  {status.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <BoardCreatorRoundEditor
                title="Jeopardy!"
                roundKey="firstBoard"
                categories={board.firstBoard.categories}
                onCategoryChange={setRoundCategory}
                onClueFieldChange={setClueField}
              />
              <BoardCreatorRoundEditor
                title="Double Jeopardy"
                roundKey="secondBoard"
                categories={board.secondBoard.categories}
                onCategoryChange={setRoundCategory}
                onClueFieldChange={setClueField}
              />
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
