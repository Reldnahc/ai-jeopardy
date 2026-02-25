import { useState } from "react";

type QuestionItemProps = {
  value: number;
  question: string;
  answer: string;
};

const QuestionItem = ({ value, question, answer }: QuestionItemProps) => {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="border-b border-slate-200/80 px-4 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => setShowAnswer(!showAnswer)}
        aria-expanded={showAnswer}
        className="flex w-full items-start justify-between gap-3 text-left transition-colors duration-200 hover:text-blue-700"
      >
        <span className="flex flex-wrap items-center gap-x-2 text-sm leading-6 text-slate-800 md:text-[0.95rem]">
          <span
            className="inline-flex items-center font-swiss911 tracking-widest text-shadow-jeopardy text-yellow-300 leading-6 align-middle text-[1.32em]"
            style={{ WebkitTextStroke: "1px #3b2b00" }}
          >
            <span className="text-[0.7em] mr-0 leading-none">$</span>
            <span className="leading-none">{value}</span>
          </span>
          <span className="font-medium">{question}</span>
        </span>
        <span
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
            showAnswer
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-600"
          }`}
          aria-hidden="true"
        >
          <span className="relative block h-2.5 w-2.5">
            <span className="absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
            {!showAnswer && (
              <span className="absolute left-1/2 top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
            )}
          </span>
        </span>
      </button>

      <div
        className={`overflow-hidden pl-1 transition-all duration-200 ease-out ${
          showAnswer ? "max-h-48 pt-2 opacity-100" : "max-h-0 pt-0 opacity-0"
        }`}
      >
        <div
          className={`transition-all duration-200 ease-out ${
            showAnswer ? "translate-y-0" : "-translate-y-1"
          }`}
        >
          <p className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold leading-6 text-slate-800 shadow-sm">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuestionItem;
