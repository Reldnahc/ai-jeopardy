import type { Game } from "../../ws/context.types.js";

export const AI_HOST_VARIANTS: Record<string, string[]> = {
  correct: ["That's correct.", "Yes, that's right.", "Correct.", "You got it."],
  incorrect: [
    "No, that's not it.",
    "Sorry, that's incorrect.",
    "Incorrect.",
    "Nope. That's not the one.",
    "That’s not correct",
  ],
  rebuzz: [
    "Would anyone else like to answer?",
    "Anyone else?",
    "buzz in if you know it.",
    "Still open—anyone else?",
  ],
  nobody: [
    "Looks like nobody got it.",
    "No one buzzed in.",
    "Time's up—no one got it.",
    "We didn't get an answer on that one.",
  ],
  nobody_final_jeopardy: ["Looks like nobody got it.", "Nobody got the final clue today."],
  welcome_intro: ["Welcome to AI Jeopardy."],
  welcome_outro: ["will be starting us off today.", "you're up first."],
  your_up: ["you're up.", "go ahead.", "pick the next clue."],
  daily_double: ["Daily Double!"],
  daily_double2: ["You've found the Daily Double."],
  single_wager: ["What’s your wager?", "Make your wager"],
  all_wager: ["Make your wagers."],
  present_clue: ["Here’s the clue."],
  double_jeopardy: ["That’s the end of the Jeopardy round.", "That’s the end of the first round."],
  double_jeopardy2: [
    "Coming up, Double Jeopardy",
    "Coming next, Double Jeopardy",
    "Up next, Double Jeopardy",
  ],
  final_jeopardy: ["That’s the end of the Double Jeopardy round."],
  final_jeopardy2: ["It’s time for Final Jeopardy"],
  final_jeopardy_finale: ["Answers are in. Let's see our top contestants."],
  final_jeopardy_finale2: ["lets look at the answer from"],
  final_jeopardy_end: ["That's the end of the game "],
  final_jeopardy_end2: ["is today's Jeopardy champion."],
  final_jeopardy_category: ["Here is the category.", "Here's today's category."],
  final_jeopardy_clue: ["Here is the Final Jeopardy clue."],
  answer_was: ["The answer was", "It was"],
  i_didnt_catch_that: ["I didn't catch that.", "Sorry, I didn't catch that."],
  say_wager_again: ["Please say your wager again", "Please repeat your wager"],
  their_wager_was: ["Their wager was "],
  todays_clue: ["Today's final jeopardy clue is.", "Today's clue is.", "Today's final clue is."],
  you_have: ["You have 30 seconds."],
  correct_followup_sm: [
    "That adds a little more to your score.",
    "Nice pickup there.",
    "That helps.",
    "Every bit counts.",
  ],
  correct_followup_lg: [
    "And that is a huge swing.",
    "Big wager, big reward.",
    "That pays off in a big way.",
    "That’s a massive boost to your score.",
  ],
  incorrect_followup_sm: [
    "That’ll cost you a bit.",
    "A small setback there.",
    "That drops you down slightly.",
    "Not too much damage done.",
  ],
  incorrect_followup_lg: [
    "And that is a costly miss.",
    "That’s a big drop.",
    "A huge swing in the wrong direction.",
    "That’s going to hurt your score.",
  ],

  placeholder: ["placeholder audio"],
};

export function nameCalloutText(name: string): string {
  return `${name}!`;
}

export function collectBoardValues(game: Game): number[] {
  const valueSet = new Set<number>();

  const boards = [
    game.boardData?.firstBoard?.categories ?? [],
    game.boardData?.secondBoard?.categories ?? [],
  ];

  for (const boardCats of boards) {
    for (const cat of boardCats) {
      for (const clue of cat?.values ?? []) {
        const v = Number(clue?.value);
        if (Number.isFinite(v) && v > 0) valueSet.add(v);
      }
    }
  }

  return Array.from(valueSet).sort((a, b) => a - b);
}
