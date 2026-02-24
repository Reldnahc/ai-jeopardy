import { useState } from "react";
import QuestionItem from "./QuestionItem.tsx";
import { BoardValue } from "../../types/Board.ts";

type CollapsibleCategoryProps = {
  category: string;
  values: BoardValue[];
};

const CollapsibleCategory = ({ category, values }: CollapsibleCategoryProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white/90 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-200 ${
          open ? "bg-slate-100 text-slate-900" : "text-slate-800 hover:bg-slate-50"
        }`}
      >
        <span className="pr-3 text-base font-semibold tracking-[0.01em] md:text-lg">{category}</span>
        <span
          className={`ml-2 text-sm font-semibold text-blue-700 transition-transform duration-200 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          v
        </span>
      </button>

      <div
        className={`overflow-hidden border-t border-slate-200 bg-slate-50/60 transition-all duration-300 ease-out ${
          open ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {values.map((val, idx) => (
          <QuestionItem key={idx} value={val.value} question={val.question} answer={val.answer} />
        ))}
      </div>
    </div>
  );
};

export default CollapsibleCategory;
