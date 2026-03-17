import type { BoardData } from "../../../shared/types/board.ts";
import type { BoardRoundKey, EditableClueField } from "./boardCreatorState.ts";

interface BoardCreatorRoundEditorProps {
  title: string;
  roundKey: Extract<BoardRoundKey, "firstBoard" | "secondBoard">;
  categories: BoardData["firstBoard"]["categories"];
  onCategoryChange: (round: BoardRoundKey, categoryIndex: number, nextName: string) => void;
  onClueFieldChange: (
    round: BoardRoundKey,
    categoryIndex: number,
    clueIndex: number,
    field: EditableClueField,
    value: string,
  ) => void;
}

export default function BoardCreatorRoundEditor(props: BoardCreatorRoundEditorProps) {
  const { title, roundKey, categories, onCategoryChange, onClueFieldChange } = props;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-4">
        {categories.map((category, categoryIndex) => (
          <div key={`${roundKey}-${categoryIndex}`} className="rounded-lg border border-slate-200 p-3">
            <input
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400"
              value={category.category}
              onChange={(event) => onCategoryChange(roundKey, categoryIndex, event.target.value)}
            />
            <div className="mt-2 grid gap-2">
              {category.values.map((clue, clueIndex) => (
                <div key={`${roundKey}-${categoryIndex}-${clueIndex}`} className="grid gap-2 md:grid-cols-12">
                  <input
                    type="number"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 md:col-span-2"
                    value={clue.value}
                    onChange={(event) =>
                      onClueFieldChange(roundKey, categoryIndex, clueIndex, "value", event.target.value)
                    }
                  />
                  <input
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 md:col-span-5"
                    value={clue.question}
                    onChange={(event) =>
                      onClueFieldChange(
                        roundKey,
                        categoryIndex,
                        clueIndex,
                        "question",
                        event.target.value,
                      )
                    }
                  />
                  <input
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 md:col-span-5"
                    value={clue.answer}
                    onChange={(event) =>
                      onClueFieldChange(
                        roundKey,
                        categoryIndex,
                        clueIndex,
                        "answer",
                        event.target.value,
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
  );
}
