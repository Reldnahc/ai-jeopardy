// backend/repositories/profileRepository.ts
import type { Pool } from "pg";

function normalizeUsername(u: unknown): string {
    return String(u ?? "").trim().toLowerCase();
}

function normalizeEmail(email: unknown): string | null {
    const v = String(email ?? "").trim().toLowerCase();
    return v.length ? v : null;
}

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

    created_at: string; // pg returns string unless you configure parsers
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
    font: string | null;
    icon: string | null;

    // legacy stats still returned (subset)
    games_finished: number;
    games_won: number;
    boards_generated: number;
    money_won: number;

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
    font: string | null;
}

type IncrementableStat =
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

export function createProfileRepository(pool: Pool) {
    if (!pool) throw new Error("createProfileRepository: missing pool");

    async function getRoleById(userId: string | null | undefined): Promise<string | null> {
        if (!userId) return null;

        const { rows } = await pool.query<{ role: string }>(
            "select role from public.profiles where id = $1 limit 1",
            [userId]
        );

        return rows?.[0]?.role ?? null;
    }

    async function insertProfile(
        email: string | null | undefined,
        usernameRaw: string,
        displayname: string,
        passwordHash: string
    ): Promise<PublicUserRow | null> {
        const username = normalizeUsername(usernameRaw);
        const emailNorm = normalizeEmail(email);

        const { rows } = await pool.query<PublicUserRow>(
            `
                with p as (
                    insert into public.profiles (email, username, displayname, password_hash)
                        values ($1, $2, $3, $4)
                        returning id, email, username, displayname, role
                )
                select
                    p.id,
                    p.email,
                    p.username,
                    p.role,
                    p.displayname,

                    c.color,
                    c.text_color,
                    c.name_color,
                    c.border,
                    c.font
                from p
                         left join public.profile_customization c on c.profile_id = p.id
            `,
            [emailNorm, username, displayname, passwordHash]
        );

        return rows?.[0] ?? null;
    }

    async function getLoginRowByUsername(usernameRaw: string): Promise<LoginRow | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<LoginRow>(
            `
                select
                    p.id,
                    p.email,
                    p.username,
                    p.role,
                    p.displayname,

                    c.color,
                    c.text_color,
                    c.name_color,
                    c.border,
                    c.font,

                    p.password_hash
                from public.profiles p
                         left join public.profile_customization c on c.profile_id = p.id
                where p.username = $1
                limit 1
            `,
            [username]
        );

        return rows?.[0] ?? null;
    }

    async function getPublicUserById(userId: string | null | undefined): Promise<PublicUserRow | null> {
        if (!userId) return null;

        const { rows } = await pool.query<PublicUserRow>(
            `
                select
                    p.id,
                    p.email,
                    p.username,
                    p.role,
                    p.displayname,

                    c.color,
                    c.text_color,
                    c.name_color,
                    c.border,
                    c.font
                from public.profiles p
                         left join public.profile_customization c on c.profile_id = p.id
                where p.id = $1
                limit 1
            `,
            [userId]
        );

        return rows?.[0] ?? null;
    }

    async function getMeProfile(userId: string | null | undefined): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const { rows } = await pool.query<MeProfileRow>(
            `
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
                where p.id = $1
                limit 1
            `,
            [userId]
        );

        return rows?.[0] ?? null;
    }

    async function searchProfiles(q: unknown, limit: number = 5): Promise<SearchProfileRow[]> {
        const query = String(q ?? "").trim();
        if (!query || query.length < 2) return [];

        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 20) : 5;
        const like = `%${query}%`;

        const { rows } = await pool.query<SearchProfileRow>(
            `
                select
                    p.username,
                    p.displayname,

                    c.color,
                    c.text_color,
                    c.name_color,
                    c.border,
                    c.font
                from public.profiles p
                         left join public.profile_customization c on c.profile_id = p.id
                where p.username ilike $1
                   or p.displayname ilike $1
                order by
                    case
                        when p.username ilike $2 then 0
                        when p.username ilike $1 then 1
                        else 2
                        end,
                    p.username asc
                limit $3
            `,
            [like, `${query}%`, safeLimit]
        );

        return rows ?? [];
    }

    async function getPublicProfileByUsername(usernameRaw: string): Promise<PublicProfileRow | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<PublicProfileRow>(
            `
                select
                    p.id,
                    p.username,
                    p.displayname,
                    p.role,

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
                where p.username = $1
                limit 1
            `,
            [username]
        );

        return rows?.[0] ?? null;
    }

    async function getIdByUsername(usernameRaw: string): Promise<string | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<{ id: string }>(
            `select id from public.profiles where username = $1 limit 1`,
            [username]
        );

        return rows?.[0]?.id ?? null;
    }

    async function updateCustomization(
        userId: string | null | undefined,
        patch: CustomizationPatch
    ): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        // allow null to clear bio/font/icon
        if ("bio" in patch) {
            updates.push(`bio = $${i++}`);
            values.push(patch.bio ?? null);
        }

        if (patch.color !== undefined) {
            updates.push(`color = $${i++}`);
            values.push(patch.color);
        }
        if (patch.text_color !== undefined) {
            updates.push(`text_color = $${i++}`);
            values.push(patch.text_color);
        }
        if (patch.name_color !== undefined) {
            updates.push(`name_color = $${i++}`);
            values.push(patch.name_color);
        }
        if (patch.border !== undefined) {
            updates.push(`border = $${i++}`);
            values.push(patch.border);
        }

        if ("font" in patch) {
            updates.push(`font = $${i++}`);
            values.push(patch.font ?? null);
        }
        if ("icon" in patch) {
            updates.push(`icon = $${i++}`);
            values.push(patch.icon ?? null);
        }

        if (updates.length === 0) return null;

        values.push(userId);

        const { rows } = await pool.query<MeProfileRow>(
            `
                with upd_c as (
                    update public.profile_customization
                        set ${updates.join(", ")}, updated_at = now()
                        where profile_id = $${i}
          returning profile_id
        ),
        upd_p as (
          update public.profiles
          set updated_at = now()
          where id = (select profile_id from upd_c)
          returning id
        )
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
        where p.id = (select id from upd_p)
        limit 1
      `,
            values
        );

        return rows?.[0] ?? null;
    }

    async function listLeaderboard(
        statRaw: unknown,
        limitRaw: unknown,
        offsetRaw: unknown
    ): Promise<LeaderboardRow[]> {
        const stat = String(statRaw ?? "").trim() as LeaderboardStatKey;

        const allowed = new Set<LeaderboardStatKey>([
            "money_won",
            "games_won",
            "games_finished",
            "correct_answers",
            "true_daily_doubles",
            "times_buzzed",
            "final_jeopardy_corrects",
            "daily_double_found",
            "daily_double_correct",
            "clues_selected",
        ]);


        const safeStat: LeaderboardStatKey = allowed.has(stat) ? stat : "money_won";

        const limitNum = Number(limitRaw ?? 25);
        const offsetNum = Number(offsetRaw ?? 0);

        const limit = Number.isFinite(limitNum) ? Math.min(Math.max(limitNum, 1), 100) : 25;
        const offset = Number.isFinite(offsetNum) ? Math.max(offsetNum, 0) : 0;

        const { rows } = await pool.query<LeaderboardRow>(
            `
        select
            p.username,
            p.displayname,
            coalesce(s.${safeStat}, 0)::float8 as value,

            coalesce(c.color, '#3b82f6') as color,
            coalesce(c.text_color, '#ffffff') as text_color,
            coalesce(c.name_color, '#111827') as name_color,
            coalesce(c.border, '') as border,
            c.font,
            c.icon
        from public.profile_statistics s
        join public.profiles p on p.id = s.profile_id
        left join public.profile_customization c on c.profile_id = p.id
        where coalesce(s.${safeStat}, 0) > 0
        order by coalesce(s.${safeStat}, 0) desc, p.username asc
        limit $1 offset $2
        `,
            [limit, offset]
        );

        return (rows ?? []).map((r) => ({
            ...r,
            username: String(r.username ?? "").trim().toLowerCase(),
            displayname: String(r.displayname ?? r.username ?? "").trim(),
            value: Number(r.value ?? 0),
        }));
    }

    async function incrementStats(userId: string | null | undefined, deltas: StatDeltas): Promise<MeProfileRow | null> {
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
            values
        );

        return rows?.[0] ?? null;
    }

    async function getPublicProfilesByUsernames(
        usernamesRaw: Array<string | null | undefined>,
        opts?: { limit?: number }
    ): Promise<PublicProfileRow[]> {
        const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

        // normalize + preserve order (unique)
        const ordered: string[] = [];
        const seen = new Set<string>();

        for (const u of usernamesRaw ?? []) {
            const n = normalizeUsername(u);
            if (!n) continue;
            if (seen.has(n)) continue;
            seen.add(n);
            ordered.push(n);
            if (ordered.length >= limit) break;
        }

        if (ordered.length === 0) return [];

        const { rows } = await pool.query<PublicProfileRow>(
            `
      select
        p.id,
        p.username,
        p.displayname,
        p.role,

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
      where p.username = any($1::text[])
    `,
            [ordered]
        );

        // preserve caller order (DB won't guarantee order with ANY)
        const byUsername = new Map<string, PublicProfileRow>();
        for (const r of rows ?? []) {
            byUsername.set(normalizeUsername(r.username), r);
        }

        const out: PublicProfileRow[] = [];
        for (const u of ordered) {
            const r = byUsername.get(u);
            if (r) out.push(r);
        }

        return out;
    }

    async function addTokens(userId: string, amount: number) {
        return incrementStats(userId, { tokens: amount });
    }

    async function incrementBoardsGenerated(userId: string, n: number = 1) {
        return incrementStats(userId, { boards_generated: n });
    }

    async function incrementGamesFinished(userId: string, n: number = 1) {
        return incrementStats(userId, { games_finished: n });
    }

    async function incrementGamesWon(userId: string, n: number = 1) {
        return incrementStats(userId, { games_won: n });
    }

    async function addMoneyWon(userId: string, amount: number) {
        return incrementStats(userId, { money_won: amount });
    }

    async function incrementGamesPlayed(userId: string, n: number = 1) {
        return incrementStats(userId, { games_played: n });
    }

    async function incrementDailyDoubleFound(userId: string, n: number = 1) {
        return incrementStats(userId, { daily_double_found: n });
    }

    async function incrementDailyDoubleCorrect(userId: string, n: number = 1) {
        return incrementStats(userId, { daily_double_correct: n });
    }

    async function incrementFinalJeopardyParticipations(userId: string, n: number = 1) {
        return incrementStats(userId, { final_jeopardy_participations: n });
    }

    async function incrementFinalJeopardyCorrects(userId: string, n: number = 1) {
        return incrementStats(userId, { final_jeopardy_corrects: n });
    }

    async function incrementCluesSelected(userId: string, n: number = 1) {
        return incrementStats(userId, { clues_selected: n });
    }

    async function incrementTimesBuzzed(userId: string, n: number = 1) {
        return incrementStats(userId, { times_buzzed: n });
    }

    async function incrementTotalBuzzes(userId: string, n: number = 1) {
        return incrementStats(userId, { total_buzzes: n });
    }

    async function incrementCorrectAnswers(userId: string, n: number = 1) {
        return incrementStats(userId, { correct_answers: n });
    }

    async function incrementWrongAnswers(userId: string, n: number = 1) {
        return incrementStats(userId, { wrong_answers: n });
    }

    async function incrementCluesSkipped(userId: string, n: number = 1) {
        return incrementStats(userId, { clues_skipped: n });
    }

    async function incrementTrueDailyDoubles(userId: string, n: number = 1) {
        return incrementStats(userId, { true_daily_doubles: n });
    }


    return {
        getRoleById,
        insertProfile,
        getLoginRowByUsername,
        getPublicUserById,
        getMeProfile,
        getPublicProfilesByUsernames,
        searchProfiles,
        getPublicProfileByUsername,
        getIdByUsername,
        updateCustomization,
        listLeaderboard,

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

        incrementStats,
    };
}
