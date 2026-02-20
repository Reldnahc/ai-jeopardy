// backend/repositories/profile/profile.types.ts

export type LeaderboardStatKey =
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

export interface LeaderboardRow {
  username: string;
  displayname: string;
  value: number;

  color: string;
  text_color: string;
  name_color: string;
  border: string;
  border_color: string;
  background: string;
  background_color: string;
  font: string | null;
  icon: string | null;
}

export interface PublicUserRow {
  id: string;
  email: string | null;
  username: string;
  role: string;
  displayname: string;

  // customization (minimal for UI)
  color: string;
  text_color: string;
  name_color: string;
  border: string;
  border_color: string;
  background: string;
  background_color: string;
  font: string | null;
}

export interface LoginRow extends PublicUserRow {
  password_hash: string;
}

export type CustomizationPatch = Partial<{
  bio: string | null;
  color: string;
  text_color: string;
  name_color: string;
  border: string;
  border_color: string;
  background: string;
  background_color: string;
  font: string | null;
  icon: string | null;
}>;

export interface MeProfileRow extends PublicUserRow {
  tokens: number;

  bio: string | null;
  icon: string | null;

  // legacy stats still returned (subset)
  games_finished: number;
  games_won: number;
  boards_generated: number;
  money_won: number;

  created_at: string;
  updated_at: string;
}

export interface PublicProfileRow {
  id: string;
  username: string;
  displayname: string;
  role: string;

  bio: string | null;
  color: string;
  text_color: string;
  name_color: string;
  border: string;
  border_color: string;
  background: string;
  background_color: string;
  font: string | null;
  icon: string | null;

  // stats
  games_played: number;
  games_finished: number;
  games_won: number;
  boards_generated: number;
  money_won: number;

  daily_double_found: number;
  daily_double_correct: number;
  true_daily_doubles: number;

  final_jeopardy_participations: number;
  final_jeopardy_corrects: number;

  clues_selected: number;
  clues_skipped: number;

  times_buzzed: number;
  total_buzzes: number;

  correct_answers: number;
  wrong_answers: number;

  created_at: string;
  updated_at: string;
}

export interface SearchProfileRow {
  username: string;
  displayname: string;

  color: string;
  text_color: string;
  name_color: string;
  border: string;
  border_color: string;
  background: string;
  background_color: string;
  font: string | null;
}

export type IncrementableStat =
  | "tokens"
  | "boards_generated"
  | "games_finished"
  | "games_won"
  | "money_won"
  | "games_played"
  | "daily_double_found"
  | "daily_double_correct"
  | "final_jeopardy_participations"
  | "final_jeopardy_corrects"
  | "clues_selected"
  | "times_buzzed"
  | "total_buzzes"
  | "correct_answers"
  | "wrong_answers"
  | "clues_skipped"
  | "true_daily_doubles";

export type StatDeltas = Partial<Record<IncrementableStat, number>>;
