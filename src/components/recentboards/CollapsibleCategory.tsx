import { useState } from "react";
import QuestionItem from "./QuestionItem.tsx";
import { BoardValue } from "../../types/Board.ts"; // Adjust the import path as needed

type CollapsibleCategoryProps = {
  category: string; // The name of the category
  values: BoardValue[]; // The list of values under this category
};

const CollapsibleCategory = ({ category, values }: CollapsibleCategoryProps) => {
  const [open, setOpen] = useState(false); // Collapsed by default

  return (
    <div className="mb-2">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={`w-full text-left font-bold text-lg focus:outline-none flex justify-between items-center
          ${open ? "text-blue-700" : "text-gray-900"}
          hover:bg-gray-200 hover:rounded-lg py-1 px-2 transition-all duration-300`}
      >
        <span>{category}</span>
        <span
          className={`ml-2 text-xl transform transition-transform duration-300 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Collapsible content */}
      <div
        className={`ml-3 overflow-hidden transition-all duration-500 ease-out ${open ? "max-h-[1000px]" : "max-h-0"}`}
        style={{ opacity: open ? 1 : 0 }}
      >
        {values.map((val, idx) => (
          <QuestionItem key={idx} value={val.value} question={val.question} answer={val.answer} />
        ))}
      </div>
    </div>
  );
};

export default CollapsibleCategory;
