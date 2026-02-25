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
        <strong>AI Jeopardy</strong> is live multiplayer trivia with voice reading, buzzer races,
        and auto-judged answers.
      </p>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">Getting Started</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>Log in, then click Create Game.</li>
        <li>Invite players with the Game ID (lobbies support 1-5 players; 3 is recommended).</li>
        <li>Set up categories and timers in the lobby.</li>
        <li>When everyone is ready, the host clicks Start Game.</li>
      </ul>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">Lobby Guide</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>Each category slot has three controls: edit text, lock/unlock, and randomize.</li>
        <li>Lock categories you want to keep before generating a new category pool.</li>
        <li>
          Category Generation lets you set a prompt and generate a fresh pool. If refresh is on
          cooldown, wait for the timer.
        </li>
        <li>Time to Buzz and Time to Answer control the pace of each clue.</li>
        <li>Only the host can start the game, but everyone can help prep the board.</li>
      </ul>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">During a Clue</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>The selector picks a clue and the AI host reads it.</li>
        <li>When buzzing opens, the first valid buzz gets the attempt.</li>
        <li>If you buzz too early you might get locked out.</li>
        <li>
          That player answers <strong>by voice</strong> and the game scores it automatically.
        </li>
        <li>A correct answer adds points and makes that player the next selector.</li>
        <li>An incorrect answer subtracts points and blocks rebuzzing for that clue.</li>
      </ul>

      <h3 className="mt-6 text-xl font-semibold text-slate-800">Special Rounds</h3>
      <ul className="list-disc ml-6 mt-3 text-lg text-slate-700 space-y-2">
        <li>Daily Double: the active player places a voice wager, then answers solo.</li>
        <li>
          Final Jeopardy: the top 3 players submit wagers, answer the final clue, and wagers are
          applied to scores.
        </li>
      </ul>

      <p className="mt-6 text-lg text-slate-700">Fast buzzes win clues. Smart wagers win games.</p>
    </details>
  );
}
