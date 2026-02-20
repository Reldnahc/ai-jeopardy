// backend/repositories/profile/profile.stats.ts
import type { Pool } from "pg";
import type { IncrementableStat, MeProfileRow, StatDeltas } from "./profile.types.js";
import { normalizeUsername } from "./profile.util.js";

// Keep this module responsible for username->id caching + stat updates
export function createProfileStatsRepo(pool: Pool) {
  async function getIdByUsername(usernameRaw: string): Promise<string | null> {
    const username = normalizeUsername(usernameRaw);
    if (!username) return null;

    const { rows } = await pool.query<{ id: string }>(
      `select id from public.profiles where username = $1 limit 1`,
      [username],
    );

    return rows?.[0]?.id ?? null;
  }

  const usernameToIdCache = new Map<string, string>();

  async function getIdByUsernameCached(usernameRaw: unknown): Promise<string | null> {
    const username = normalizeUsername(usernameRaw);
    if (!username) return null;

    const hit = usernameToIdCache.get(username);
    if (hit) return hit;

    const id = await getIdByUsername(username);
    if (id) usernameToIdCache.set(username, id);
    return id;
  }

  async function incrementStats(
    usernameRaw: string | null | undefined,
    deltas: StatDeltas,
  ): Promise<MeProfileRow | null> {
    const id = await getIdByUsernameCached(usernameRaw);
    if (!id) return null;
    return incrementStatsById(id, deltas);
  }

  async function incrementStatsById(
    userId: string | null | undefined,
    deltas: StatDeltas,
  ): Promise<MeProfileRow | null> {
    if (!userId) return null;

    const tokenAllowed = new Set<IncrementableStat>(["tokens"]);
    const statAllowed = new Set<IncrementableStat>([
      "boards_generated",
      "games_finished",
      "games_played",
      "money_won",
      "games_won",
      "daily_double_found",
      "daily_double_correct",
      "final_jeopardy_participations",
      "final_jeopardy_corrects",
      "clues_selected",
      "times_buzzed",
      "total_buzzes",
      "correct_answers",
      "wrong_answers",
      "clues_skipped",
      "true_daily_doubles",
    ]);

    const entries = Object.entries(deltas ?? {}).filter(([k, v]) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n === 0) return false;
      return tokenAllowed.has(k as IncrementableStat) || statAllowed.has(k as IncrementableStat);
    }) as Array<[IncrementableStat, number]>;

    if (entries.length === 0) return null;

    const tokenEntries = entries.filter(([k]) => tokenAllowed.has(k));
    const statEntries = entries.filter(([k]) => statAllowed.has(k));

    const ctes: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (tokenEntries.length > 0) {
      const sets: string[] = [];
      for (const [k, v] of tokenEntries) {
        sets.push(`${k} = ${k} + $${i++}`);
        values.push(Number(v));
      }
      values.push(userId);
      ctes.push(`
        up_tokens as (
          update public.profiles
          set ${sets.join(", ")}, updated_at = now()
          where id = $${i++}
          returning id
        )
      `);
    }

    if (statEntries.length > 0) {
      const sets: string[] = [];
      for (const [k, v] of statEntries) {
        sets.push(`${k} = ${k} + $${i++}`);
        values.push(Number(v));
      }
      values.push(userId);
      ctes.push(`
        up_stats as (
          update public.profile_statistics
          set ${sets.join(", ")}, updated_at = now()
          where profile_id = $${i++}
          returning profile_id
        )
      `);
    }

    ctes.push(`
      up_profile_clock as (
        update public.profiles
        set updated_at = now()
        where id = coalesce(
          ${tokenEntries.length > 0 ? "(select id from up_tokens)" : "null"},
          ${statEntries.length > 0 ? "(select profile_id from up_stats)" : "null"}
        )
        returning id
      )
    `);

    const { rows } = await pool.query<MeProfileRow>(
      `
        with
        ${ctes.join(",\n")}
        select
          p.id,
          p.email,
          p.username,
          p.role,
          p.displayname,
          p.tokens,

          c.bio,
          c.color,
          c.text_color,
          c.name_color,
          c.border,
          c.font,
          c.icon,

          s.games_finished,
          s.games_won,
          s.boards_generated,
          s.money_won,

          p.created_at,
          p.updated_at
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        left join public.profile_statistics s on s.profile_id = p.id
        where p.id = (select id from up_profile_clock)
        limit 1
      `,
      values,
    );

    return rows?.[0] ?? null;
  }

  // Convenience wrappers (same API you already had)
  async function addTokens(username: string, amount: number) {
    return incrementStats(username, { tokens: amount });
  }

  async function incrementBoardsGenerated(username: string, n: number = 1) {
    return incrementStats(username, { boards_generated: n });
  }

  async function incrementGamesFinished(username: string, n: number = 1) {
    return incrementStats(username, { games_finished: n });
  }

  async function incrementGamesWon(username: string, n: number = 1) {
    return incrementStats(username, { games_won: n });
  }

  async function addMoneyWon(username: string, amount: number) {
    return incrementStats(username, { money_won: amount });
  }

  async function incrementGamesPlayed(username: string, n: number = 1) {
    return incrementStats(username, { games_played: n });
  }

  async function incrementDailyDoubleFound(username: string, n: number = 1) {
    return incrementStats(username, { daily_double_found: n });
  }

  async function incrementDailyDoubleCorrect(username: string, n: number = 1) {
    return incrementStats(username, { daily_double_correct: n });
  }

  async function incrementFinalJeopardyParticipations(username: string, n: number = 1) {
    return incrementStats(username, { final_jeopardy_participations: n });
  }

  async function incrementFinalJeopardyCorrects(username: string, n: number = 1) {
    return incrementStats(username, { final_jeopardy_corrects: n });
  }

  async function incrementCluesSelected(username: string, n: number = 1) {
    return incrementStats(username, { clues_selected: n });
  }

  async function incrementTimesBuzzed(username: string, n: number = 1) {
    return incrementStats(username, { times_buzzed: n });
  }

  async function incrementTotalBuzzes(username: string, n: number = 1) {
    return incrementStats(username, { total_buzzes: n });
  }

  async function incrementCorrectAnswers(username: string, n: number = 1) {
    return incrementStats(username, { correct_answers: n });
  }

  async function incrementWrongAnswers(username: string, n: number = 1) {
    return incrementStats(username, { wrong_answers: n });
  }

  async function incrementCluesSkipped(username: string, n: number = 1) {
    return incrementStats(username, { clues_skipped: n });
  }

  async function incrementTrueDailyDoubles(username: string, n: number = 1) {
    return incrementStats(username, { true_daily_doubles: n });
  }

  return {
    // core
    incrementStats,
    incrementStatsById,

    // wrappers
    addTokens,
    incrementBoardsGenerated,
    incrementGamesFinished,
    incrementGamesWon,
    addMoneyWon,
    incrementGamesPlayed,
    incrementDailyDoubleFound,
    incrementDailyDoubleCorrect,
    incrementTrueDailyDoubles,
    incrementFinalJeopardyParticipations,
    incrementFinalJeopardyCorrects,
    incrementCluesSelected,
    incrementTimesBuzzed,
    incrementTotalBuzzes,
    incrementCorrectAnswers,
    incrementWrongAnswers,
    incrementCluesSkipped,
  };
}
