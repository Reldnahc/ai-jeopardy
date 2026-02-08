// backend/repositories/profileRepository.ts
import type { Pool } from "pg";

function normalizeUsername(u: unknown): string {
    return String(u ?? "").trim().toLowerCase();
}

function normalizeEmail(email: unknown): string | null {
    const v = String(email ?? "").trim().toLowerCase();
    return v.length ? v : null;
}

export interface PublicUserRow {
    id: string;
    email: string | null;
    username: string;
    role: string;
    displayname: string;
    color: string;
    text_color: string;
}

export interface LoginRow extends PublicUserRow {
    password_hash: string;
}

export interface MeProfileRow extends PublicUserRow {
    tokens: number;
    bio: string | null;
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
    bio: string | null;
    color: string;
    text_color: string;
    games_finished: number;
    games_won: number;
    boards_generated: number;
    money_won: number;
    created_at: string;
}

export interface SearchProfileRow {
    username: string;
    displayname: string;
    color: string;
    text_color: string;
}

type IncrementableStat =
| "tokens"
| "boards_generated"
| "games_finished"
| "games_won"
| "money_won";

export type StatDeltas = Partial<Record<IncrementableStat, number>>;

export function createProfileRepository(pool: Pool) {
    if (!pool) throw new Error("createProfileRepository: missing pool");

    async function getRoleById(userId: string | null | undefined): Promise<string | null> {
        if (!userId) return null;

        const { rows } = await pool.query<{ role: string }>(
            "select role from profiles where id = $1 limit 1",
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
            `insert into profiles (email, username, displayname, password_hash)
       values ($1, $2, $3, $4)
       returning id, email, username, displayname, role, color, text_color`,
                [emailNorm, username, displayname, passwordHash]
        );

        return rows?.[0] ?? null;
    }

    async function getLoginRowByUsername(usernameRaw: string): Promise<LoginRow | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<LoginRow>(
            `select id, email, username, role, displayname, color, text_color, password_hash
       from profiles
       where username = $1
       limit 1`,
                [username]
        );

        return rows?.[0] ?? null;
    }

    async function getPublicUserById(userId: string | null | undefined): Promise<PublicUserRow | null> {
        if (!userId) return null;

        const { rows } = await pool.query<PublicUserRow>(
            `select id, email, username, role, displayname, color, text_color
       from profiles
       where id = $1
       limit 1`,
                [userId]
        );

        return rows?.[0] ?? null;
    }

    async function getMeProfile(userId: string | null | undefined): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const { rows } = await pool.query<MeProfileRow>(
            `select
        id,
        email,
        username,
        displayname,
        role,
        tokens,
        bio,
        color,
        text_color,
        games_finished,
        games_won,
        boards_generated,
        money_won,
        created_at,
        updated_at
       from profiles
       where id = $1
       limit 1`,
                [userId]
        );

        return rows?.[0] ?? null;
    }

    async function searchProfiles(
        q: unknown,
        limit: number = 5
    ): Promise<SearchProfileRow[]> {
        const query = String(q ?? "").trim();
        if (!query || query.length < 2) return [];

        const safeLimit = Number.isFinite(Number(limit))
            ? Math.min(Math.max(Number(limit), 1), 20)
            : 5;

        const like = `%${query}%`;

        const { rows } = await pool.query<SearchProfileRow>(
            `select
          username,
          displayname,
          color,
          text_color
       from profiles
       where username ilike $1
          or displayname ilike $1
       order by
          case
            when username ilike $2 then 0
            when username ilike $1 then 1
            else 2
          end,
          username asc
       limit $3`,
                [like, `${query}%`, safeLimit]
        );

        return rows ?? [];
    }

    async function getPublicProfileByUsername(usernameRaw: string): Promise<PublicProfileRow | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<PublicProfileRow>(
            `select
         id,
         username,
         displayname,
         bio,
         color,
         text_color,
         games_finished,
         games_won,
         boards_generated,
         money_won,
         created_at
       from profiles
       where username = $1
       limit 1`,
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

    async function updateCosmetics(
        userId: string | null | undefined,
        color: string | undefined,
        text_color: string | undefined
    ): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        if (color !== undefined) {
            updates.push(`color = $${i++}`);
            values.push(color);
        }

        if (text_color !== undefined) {
            updates.push(`text_color = $${i++}`);
            values.push(text_color);
        }

        if (updates.length === 0) return null;

        values.push(userId);

        const { rows } = await pool.query<MeProfileRow>(
            `update profiles
       set ${updates.join(", ")}, updated_at = now()
       where id = $${i}
       returning id, email, username, displayname, role, tokens, bio, color, text_color,
                 games_finished, games_won, boards_generated, money_won, created_at, updated_at`,
                values
        );

        return rows?.[0] ?? null;
    }

    async function incrementStats(
        userId: string | null | undefined,
        deltas: StatDeltas
    ): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const allowed = new Set<IncrementableStat>([
            "tokens",
            "boards_generated",
            "games_finished",
            "games_won",
            "money_won",
        ]);

        const entries = Object.entries(deltas ?? {}).filter(([k, v]) => {
            if (!allowed.has(k as IncrementableStat)) return false;
            const n = Number(v);
            return Number.isFinite(n) && n !== 0;
        }) as Array<[IncrementableStat, number]>;

        if (entries.length === 0) return null;

        const sets: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        for (const [k, v] of entries) {
            sets.push(`${k} = ${k} + $${i++}`);
            values.push(Number(v));
        }

        values.push(userId);

        const { rows } = await pool.query<MeProfileRow>(
            `update profiles
         set ${sets.join(", ")}, updated_at = now()
         where id = $${i}
         returning
           id, email, username, displayname, role,
           tokens, bio, color, text_color,
           games_finished, games_won, boards_generated, money_won,
           created_at, updated_at`,
                values
        );

        return rows?.[0] ?? null;
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

    return {
        getRoleById,
        insertProfile,
        getLoginRowByUsername,
        getPublicUserById,
        getMeProfile,
        searchProfiles,
        getPublicProfileByUsername,
        getIdByUsername,
        updateCosmetics,
        addTokens,
        incrementBoardsGenerated,
        incrementGamesFinished,
        incrementGamesWon,
        addMoneyWon,
    };
}
