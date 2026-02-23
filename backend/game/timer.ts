export const clearGameTimer = (game, gameId, ctx) => {
  if (!game) return;
  if (game.timerTimeout) {
    clearTimeout(game.timerTimeout);
    game.timerTimeout = null;
  }
  ctx.broadcast(gameId, {
    type: "timer-end",
    timerVersion: game.timerVersion,
    timerKind: game.timerKind || null,
  });
  game.timerEndTime = null;
  game.timerDuration = null; // seconds
  game.timerKind = null; // "buzz" | "answer" | null
};

export const startGameTimer = (gameId, game, ctx, durationSeconds, kind, onExpire) => {
  if (!game) return;

  // Cancel any previous timer and bump version so stale timeouts can't win
  clearGameTimer(game, gameId, ctx);
  game.timerVersion = (game.timerVersion || 0) + 1;

  const endTime = Date.now() + durationSeconds * 1000;
  game.timerEndTime = endTime;
  game.timerDuration = durationSeconds;
  game.timerKind = kind || null;

  const currentVersion = game.timerVersion;

  ctx.broadcast(gameId, {
    type: "timer-start",
    endTime,
    duration: durationSeconds,
    timerVersion: currentVersion,
    timerKind: game.timerKind,
  });

  game.timerTimeout = setTimeout(() => {
    if (game.timerVersion !== currentVersion) return;

    clearGameTimer(game, gameId, ctx);

    if (typeof onExpire === "function") {
      onExpire({
        gameId,
        game,
        broadcast: ctx.broadcast,
        timerVersion: currentVersion,
        timerKind: kind || null,
      });
    }

    ctx.broadcast(gameId, {
      type: "timer-end",
      timerVersion: currentVersion,
      timerKind: kind || null,
    });
  }, durationSeconds * 1000);
};
