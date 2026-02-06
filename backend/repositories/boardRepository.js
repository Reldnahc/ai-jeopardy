// backend/repositories/boardRepository.js

function clampInt(n, min, max, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(Math.max(Math.trunc(v), min), max);
}

export function createBoardRepository( pool ) {
    if (!pool) throw new Error("createBoardRepository: missing pool");

    async function insertBoard( ownerId, board ) {
        await pool.query(
            `insert into public.jeopardy_boards (owner, board)
       values ($1, $2::jsonb)`,
            [ownerId, board]
        );
    }

    async function listRecentBoards( limit = 10, offset = 0, model = null ) {
        const l = clampInt(limit, 1, 50, 10);
        const o = clampInt(offset, 0, 1_000_000, 0);
        const m = typeof model === "string" && model.trim() ? model.trim() : null;

        const { rows } = await pool.query(
            `
      select board
      from jeopardy_boards
      where ($3::text is null or board->>'model' = $3::text)
      order by created_at desc
      limit $1
      offset $2
      `,
            [l, o, m]
        );

        return rows?.map((r) => r.board) ?? [];
    }

    async function listBoardsByUsername( username, limit = 10, offset = 0 ) {
        const l = clampInt(limit, 1, 50, 10);
        const o = clampInt(offset, 0, 1_000_000, 0);

        const { rows } = await pool.query(
            `
      select jb.board
      from jeopardy_boards jb
      join profiles p on p.id = jb.owner
      where p.username = $1
      order by jb.created_at desc
      limit $2
      offset $3
      `,
            [String(username ?? "").trim().toLowerCase(), l, o]
        );

        return rows?.map((r) => r.board) ?? [];
    }

    return {
        insertBoard,
        listRecentBoards,
        listBoardsByUsername,
    };
}
