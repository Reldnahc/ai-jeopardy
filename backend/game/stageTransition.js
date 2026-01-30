export function isBoardFullyCleared(game, boardKey) {
    const board = game?.boardData?.[boardKey];
    if (!board?.categories) return false;

    for (const cat of board.categories) {
        for (const clue of cat.values || []) {
            const clueId = `${clue.value}-${clue.question}`;
            if (!game.clearedClues?.has(clueId)) return false;
        }
    }
    return true;
}

export function startFinalJeopardy(gameId, game, broadcast) {
    game.activeBoard = "finalJeopardy";
    game.isFinalJeopardy = true;
    game.finalJeopardyStage = "wager";

    game.wagers = {};
    game.drawings = {};

    broadcast(gameId, { type: "final-jeopardy" });
}