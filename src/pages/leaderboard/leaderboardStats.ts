export type StatKey =
  | "money_won"
  | "games_won"
  | "games_finished"
  | "correct_answers"
  | "true_daily_doubles"
  | "times_buzzed"
  | "final_jeopardy_corrects"
  | "daily_double_found"
  | "daily_double_correct"
  | "clues_selected";

export type StatOption = {
  key: StatKey;
  label: string;
  format: (n: number) => string;
};

export const STAT_OPTIONS: StatOption[] = [
  { key: "money_won", label: "Money Won", format: (n) => `$${Math.trunc(n).toLocaleString()}` },
  { key: "games_won", label: "Games Won", format: (n) => Math.trunc(n).toLocaleString() },
  { key: "games_finished", label: "Games Finished", format: (n) => Math.trunc(n).toLocaleString() },
  {
    key: "correct_answers",
    label: "Correct Answers",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  {
    key: "true_daily_doubles",
    label: "True Daily Doubles",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  { key: "times_buzzed", label: "Buzzer Wins", format: (n) => Math.trunc(n).toLocaleString() },
  {
    key: "final_jeopardy_corrects",
    label: "Final Jeopardy Correct",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  {
    key: "daily_double_found",
    label: "Daily Doubles Found",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  {
    key: "daily_double_correct",
    label: "Daily Doubles Correct",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  { key: "clues_selected", label: "Clues Selected", format: (n) => Math.trunc(n).toLocaleString() },
];

export const MAX_ROWS = 100;
export const PAGE_SIZE = 25;
