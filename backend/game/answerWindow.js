export const clearAnswerWindow = (game) => {
  if (!game) return;
  if (game.answerTimer) {
    clearTimeout(game.answerTimer);
    game.answerTimer = null;
  }
  game.answerDeadlineAt = null;
  game.answerWindowMs = null;
  game.answerWindowVersion = null;
};

export const startAnswerWindow = (gameId, game, broadcast, durationMs, onExpire) => {
  if (!game) return;

  clearAnswerWindow(game);
  game.answerWindowVersion = (game.answerWindowVersion || 0) + 1;

  const ms = Math.max(0, Number(durationMs || 0));
  const endTime = Date.now() + ms;

  game.answerDeadlineAt = endTime;
  game.answerWindowMs = ms;

  const currentVersion = game.answerWindowVersion;

  broadcast(gameId, {
    type: "answer-window-start",
    endTime,
    durationMs: ms,
    answerWindowVersion: currentVersion,
  });

  game.answerTimer = setTimeout(() => {
    if (game.answerWindowVersion !== currentVersion) return;

    clearAnswerWindow(game);

    if (typeof onExpire === "function") {
      onExpire({ gameId, game, broadcast, answerWindowVersion: currentVersion });
    }

    broadcast(gameId, { type: "answer-window-end", answerWindowVersion: currentVersion });
  }, ms);
};
