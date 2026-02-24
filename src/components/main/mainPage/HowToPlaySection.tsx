import { useState } from "react";
import OutlinedChevron from "../../../icons/OutlinedChevron.tsx";

export default function HowToPlaySection() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <details
      className="bg-white/85 p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden text-2xl font-semibold text-slate-800 cursor-pointer">
        <span className="flex w-full items-center justify-between">
          <span>How to Play</span>
          <OutlinedChevron color="#334155" rotated={isOpen} className="h-5 w-5 ml-3 shrink-0" />
        </span>
      </summary>

      <p className="mt-4 text-lg text-slate-700">
        <strong>AI Jeopardy</strong> is a live multiplayer trivia game with voice narration, buzzer
        races, and automatic judging.
      </p>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">Getting Started</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>Sign in, create a lobby, and share the Game ID with players who want to join.</li>
        <li>In the lobby, set or randomize categories, adjust settings, then start the game.</li>
        <li>The host controls game start. Once started, players are moved into the board view.</li>
      </ul>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">How Jeopardy Works</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>The active selector chooses clues from the board.</li>
        <li>The AI host reads each clue, then the buzzer opens.</li>
        <li>Players race to buzz in. First valid buzz gets the answer attempt.</li>
        <li>The buzzed player answers by microphone capture. The answer is transcribed and judged automatically.</li>
        <li>Correct answers add clue value and make that player the next selector.</li>
        <li>Incorrect answers subtract clue value and lock that player out from rebuzzing on that clue.</li>
        <li>If nobody answers correctly, the clue is revealed and play returns to the board.</li>
        <li>Early buzzing can trigger a temporary lockout, so timing matters.</li>
      </ul>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">Daily Double</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>When a Daily Double appears, only that player can answer.</li>
        <li>They place a wager by voice, then hear the clue and answer by voice.</li>
        <li>Daily Double does not use normal rebuzz flow for other players on that clue.</li>
      </ul>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">Final Jeopardy</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>After the main boards clear, finalists enter Final Jeopardy.</li>
        <li>Finalists submit wagers, then the final clue is played.</li>
        <li>Answers are captured and judged, then wagers are applied to scores.</li>
        <li>Correct adds wagered points; incorrect subtracts wagered points.</li>
        <li>Highest final score wins.</li>
      </ul>

      <p className="mt-6 text-lg text-slate-700">
        Most importantly: have fun, compete hard, and play fast on the buzzer.
      </p>
    </details>
  );
}
