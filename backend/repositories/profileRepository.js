// backend/repositories/profileRepository.js

function normalizeUsername(u) {
    return String(u ?? "").trim().toLowerCase();
}

function normalizeEmail(email) {
    const v = String(email ?? "").trim().toLowerCase();
    return v.length ? v : null;
}

export function createProfileRepository( pool ) {
    if (!pool) throw new Error("createProfileRepository: missing pool");

    async function getRoleById(userId) {
        if (!userId) return null;
        const { rows } = await pool.query(
            "select role from profiles where id = $1 limit 1",
            [userId]
        );
        return rows?.[0]?.role ?? null;
    }

    async function insertProfile( email, usernameRaw, displayname, passwordHash ) {
        const username = normalizeUsername(usernameRaw);
        const emailNorm = normalizeEmail(email);

        const { rows } = await pool.query(
            `insert into profiles (email, username, displayname, password_hash)
       values ($1, $2, $3, $4)
       returning id, email, username, displayname, role, color, text_color`,
            [emailNorm, username, displayname, passwordHash]
        );

        return rows?.[0] ?? null;
    }

    async function getLoginRowByUsername(usernameRaw) {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query(
            `select id, email, username, role, displayname, color, text_color, password_hash
       from profiles
       where username = $1
       limit 1`,
            [username]
        );

        return rows?.[0] ?? null;
    }

    async function getPublicUserById(userId) {
        if (!userId) return null;

        const { rows } = await pool.query(
            `select id, email, username, role, displayname, color, text_color
       from profiles
       where id = $1
       limit 1`,
            [userId]
        );

        return rows?.[0] ?? null;
    }

    async function getMeProfile(userId) {
        if (!userId) return null;

        const { rows } = await pool.query(
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

    async function searchProfiles(q, limit = 5) {
        const query = String(q ?? "").trim();
        if (!query || query.length < 2) return [];

        const safeLimit = Number.isFinite(Number(limit))
            ? Math.min(Math.max(Number(limit), 1), 20)
            : 5;

        const like = `%${query}%`;

        const { rows } = await pool.query(
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

    async function getPublicProfileByUsername(usernameRaw) {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query(
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

    async function getIdByUsername(usernameRaw) {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query(
            `select id from public.profiles where username = $1 limit 1`,
            [username]
        );

        return rows?.[0]?.id ?? null;
    }

    async function updateCosmetics( userId, color, text_color ) {
        if (!userId) return null;

        const updates = [];
        const values = [];
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

        const { rows } = await pool.query(
            `update profiles
       set ${updates.join(", ")}, updated_at = now()
       where id = $${i}
       returning id, email, username, displayname, role, tokens, bio, color, text_color,
                 games_finished, games_won, boards_generated, money_won, created_at, updated_at`,
            values
        );

        return rows?.[0] ?? null;
    }

    async function incrementStats(userId, deltas) {
        if (!userId) return null;

        const allowed = new Set([
            "tokens",
            "boards_generated",
            "games_finished",
            "games_won",
            "money_won",
        ]);

        const entries = Object.entries(deltas ?? {}).filter(([k, v]) => {
            if (!allowed.has(k)) return false;
            const n = Number(v);
            return Number.isFinite(n) && n !== 0;
        });

        if (entries.length === 0) return null;

        const sets = [];
        const values = [];
        let i = 1;

        for (const [k, v] of entries) {
            sets.push(`${k} = ${k} + $${i++}`);
            values.push(Number(v));
        }

        values.push(userId);

        const { rows } = await pool.query(
            `update profiles
             set ${sets.join(", ")}, updated_at = now()
             where id = $${i}
               returning
               id, email, username, displayname, role,
               tokens, bio, color, text_color,
               games_finished, games_won, boards_generated, money_won,
               created_at, updated_at
               `,
            values
        );

        return rows?.[0] ?? null;
    }

    async function addTokens(userId, amount) {
        return incrementStats(userId, { tokens: amount });
    }

    async function incrementBoardsGenerated(userId, n = 1) {
        return incrementStats(userId, { boards_generated: n });
    }

    async function incrementGamesFinished(userId, n = 1) {
        return incrementStats(userId, { games_finished: n });
    }

    async function incrementGamesWon(userId, n = 1) {
        return incrementStats(userId, { games_won: n });
    }

    async function addMoneyWon(userId, amount) {
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
