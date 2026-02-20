import { useState } from "react";

type QuestionItemProps = {
  value: number; // The monetary value of the question
  question: string; // The question text
  answer: string; // The answer text
};

const QuestionItem = ({ value, question, answer }: QuestionItemProps) => {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="mb-2">
      {/* Toggle answer visibility */}
      <button
        onClick={() => setShowAnswer(!showAnswer)}
        className="w-full text-left font-medium text-base text-gray-800 flex justify-between items-center focus:outline-none hover:text-blue-700 transition-colors duration-200"
      >
        <span>
          ${value}: {question}
        </span>
        <span
          className={`ml-2 text-2xl transition-transform duration-300 ${
            showAnswer ? "rotate-180 text-blue-700" : "text-gray-900"
          }`}
        >
          {showAnswer ? "-" : "+"}
        </span>
      </button>

      {/* Answer section */}
      <div
        className="mt-1 ml-2 transition-opacity duration-300 text-md text-gray-700"
        style={{ opacity: showAnswer ? 1 : 0 }}
      >
        - {answer}
      </div>
    </div>
  );
};

export default QuestionItem;
