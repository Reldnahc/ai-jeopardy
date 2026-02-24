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
        <span className="text-sm leading-6 text-slate-800 md:text-[0.95rem]">
          <span className="mr-1.5 font-semibold text-blue-700">${value}</span>
          <span className="font-medium">{question}</span>
        </span>
        <span
          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-200 ${
            showAnswer
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          {showAnswer ? "-" : "+"}
        </span>
      </button>

      <div
        className={`overflow-hidden pl-1 transition-all duration-250 ease-out ${
          showAnswer ? "max-h-40 pt-2 opacity-100" : "max-h-0 pt-0 opacity-0"
        }`}
      >
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700">
          {answer}
        </p>
      </div>
    </div>
  );
};

export default QuestionItem;
