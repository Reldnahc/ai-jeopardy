function normUsername(u) {
  return String(u ?? "")
    .trim()
    .toLowerCase();
}

function findPlayerByUsername(game, username) {
  const u = normUsername(username);
  if (!u) return null;
  return (game?.players || []).find((p) => normUsername(p?.username) === u) || null;
}

function displaynameFor(game, username) {
  const p = findPlayerByUsername(game, username);
  const d = String(p?.displayname ?? "").trim();
  return d || String(username ?? "").trim(); // fallback
}

function applyScore(game, username, delta) {
  const u = normUsername(username);
  if (!u) return;

  if (!game.scores) game.scores = {};
  game.scores[u] = (game.scores[u] || 0) + Number(delta || 0);
}

function getDailyDoubleWagerIfActive(game) {
  const dd = game?.dailyDouble;
  if (!dd) return null;

  const currentClueKey = game?.clueState?.clueKey || null;
  if (!currentClueKey) return null;

  // Only active for the current clue
  if (dd.clueKey !== currentClueKey) return null;

  const w = Number(dd.wager);
  if (!Number.isFinite(w)) return null;

  return w;
}

function getActiveClueWorth(game) {
  const wager = getDailyDoubleWagerIfActive(game);
  if (wager !== null) return wager;
  return parseClueValue(game?.selectedClue?.value);
}

function isDailyDoubleActiveForCurrentClue(game) {
  return getDailyDoubleWagerIfActive(game) !== null;
}

function lockBoardSelection(ctx, gameId, game) {
  if (!game) return 0;

  game.boardSelectionLocked = true;

  // version token so old scheduled unlocks can’t unlock a newer lock
  game.boardSelectionLockVersion = (game.boardSelectionLockVersion || 0) + 1;

  ctx.broadcast(gameId, {
    type: "board-selection-locked",
    lockVersion: game.boardSelectionLockVersion,
  });

  return game.boardSelectionLockVersion;
}

function unlockBoardSelection(ctx, gameId, game, lockVersion) {
  if (!game) return;

  // Only unlock if this scheduled unlock is still current
  if (typeof lockVersion === "number" && lockVersion > 0) {
    if ((game.boardSelectionLockVersion || 0) !== lockVersion) return;
  }

  if (!game.boardSelectionLocked) return;

  game.boardSelectionLocked = false;
  game.boardSelectionLockReason = null;

  ctx.broadcast(gameId, {
    type: "board-selection-unlocked",
    lockVersion: game.boardSelectionLockVersion || 0,
  });
}

function returnToBoard(game, gameId, ctx, transitioned = false) {
  // Reset clue state
  game.selectedClue = null;
  game.buzzed = null;
  game.buzzerLocked = true;
  game.phase = "board";
  game.clueState = null;

  const selectorName = String(game.selectorName || "").trim();

  let lockVersion = 0;

  lockVersion = lockBoardSelection(ctx, gameId, game);

  ctx.broadcast(gameId, {
    type: "phase-changed",
    phase: "board",
    selectorKey: game.selectorKey ?? null,
    selectorName: game.selectorName ?? null,
  });

  ctx.broadcast(gameId, {
    type: "returned-to-board",
    selectedClue: null,
    boardSelectionLocked: game.boardSelectionLocked,
  });

  const announceSelector = async () => {
    const pad = 25;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: selectorName, pad },
      { slot: "your_up", pad, after: () => unlockBoardSelection(ctx, gameId, game, lockVersion) },
    ]);
  };

  if (!transitioned) {
    ctx.fireAndForget(announceSelector(), "announcing selector");
  }
}

function finishClueAndReturnToBoard(ctx, gameId, game) {
  if (!game) return;

  // Mark cleared if we have a clue
  if (game.selectedClue) {
    if (!game.clearedClues) game.clearedClues = new Set();
    const clueId = `${game.selectedClue.value}-${game.selectedClue.question}`;
    game.clearedClues.add(clueId);

    ctx.broadcast(gameId, { type: "clue-cleared", clueId });
    ctx.broadcast(gameId, { type: "daily-double-hide-modal" });

    const transitioned = ctx.checkBoardTransition(game, gameId, ctx);
  }

  returnToBoard(game, gameId, ctx, transitioned);
}

export function parseClueValue(val) {
  const n = Number(String(val || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function autoResolveAfterJudgement(ctx, gameId, game, username, verdict) {
  if (!game || !game.selectedClue) return;

  const u = normUsername(username);
  if (!u) return;

  const worth = getActiveClueWorth(game);
  const delta = verdict === "correct" ? worth : verdict === "incorrect" ? -worth : 0;

  // Apply score immediately (authoritative)
  if (verdict === "correct" || verdict === "incorrect") {
    applyScore(game, u, delta);
    ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
  }

  const ddActive = isDailyDoubleActiveForCurrentClue(game);

  // Resolve displayname for VO / UI
  const disp = displaynameFor(game, u);

  if (verdict === "correct") {
    game.selectedClue.isAnswerRevealed = true;

    ctx.fireAndForget(ctx.repos.profiles.incrementCorrectAnswers(u), "Increment correct answer");

    const alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      {
        slot: "correct",
        after: () => ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue }),
      },
    ]);
    if (!alive) return;

    // Correct player becomes selector
    game.selectorKey = u; // ✅ username identity
    game.selectorName = disp; // ✅ displayname presentation

    if (ddActive) {
      game.dailyDouble = null;
      ctx.fireAndForget(
        ctx.repos.profiles.incrementDailyDoubleCorrect(u),
        "Increment Daily Double correct answer",
      );
    }

    await ctx.sleep(3000);
    finishClueAndReturnToBoard(ctx, gameId, game);
    return;
  }

  // verdict === "incorrect"
  ctx.fireAndForget(ctx.repos.profiles.incrementWrongAnswers(u), "Increment wrong answer");

  // NEW: Daily Double never re-opens buzzers.
  if (ddActive) {
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    const revealAnswer = async () => {
      game.selectedClue.isAnswerRevealed = true;
      ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
    };

    const clueKey = ctx.getClueKey(game, game.selectedClue);
    const assetId = game.boardData?.ttsByAnswerKey?.[clueKey] || null;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: "incorrect" },
      { slot: "answer_was", after: revealAnswer },
      { assetId },
    ]);

    game.dailyDouble = null;

    finishClueAndReturnToBoard(ctx, gameId, game);
    return;
  }

  // Lock them out from re-buzzing on this clue (keyed by username)
  if (game.clueState?.lockedOut) game.clueState.lockedOut[u] = true;

  // Clear any answer state so clue can continue
  game.buzzed = null;
  game.answeringPlayerKey = null;
  game.answerSessionId = null;
  game.answerClueKey = null;
  game.answerTranscript = game.answerTranscript ?? "";
  game.answerVerdict = "incorrect";

  // Cancel timers tied to the answering window / old buzz window
  ctx.clearAnswerWindow(game);
  ctx.clearGameTimer(game, gameId, ctx);

  // Check if anyone remains eligible to buzz (username-keyed)
  const players = game.players || [];
  const anyoneLeft = players.some((pp) => {
    const id = normUsername(pp?.username);
    if (!id) return false;
    return !game.clueState?.lockedOut?.[id];
  });

  if (!anyoneLeft) {
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    const revealAnswer = async () => {
      game.selectedClue.isAnswerRevealed = true;
      ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
    };

    const clueKey = ctx.getClueKey(game, game.selectedClue);
    const assetId = game.boardData?.ttsByAnswerKey?.[clueKey] || null;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: "incorrect" },
      { slot: "answer_was", after: revealAnswer },
      { assetId },
    ]);

    finishClueAndReturnToBoard(ctx, gameId, game);
    return;
  }

  // Prompt and then reopen buzzers for remaining eligible players
  game.buzzerLocked = true;
  ctx.broadcast(gameId, { type: "buzzer-locked" });

  await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: "incorrect", pad: 1000 },
    {
      slot: "rebuzz",
      pad: 700,
      after: () => {
        ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
        ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
      },
    },
  ]);
}

export function cancelAutoUnlock(game) {
  if (game?.autoUnlockTimer) {
    clearTimeout(game.autoUnlockTimer);
    game.autoUnlockTimer = null;
  }
  game.autoUnlockClueKey = null;
}

export function doUnlockBuzzerAuthoritative(gameId, game, ctx) {
  if (!game) return;

  // Always restart the buzz timer window when we "unlock"
  // (prevents stale timers from instantly expiring after a rebuzz)
  ctx.clearGameTimer(game, gameId, ctx);

  if (!game.clueState) game.clueState = {};
  game.clueState.buzzOpenAtMs = Date.now();

  game.buzzerLocked = false;
  ctx.broadcast(gameId, { type: "buzzer-unlocked" });

  // Reset pending buzz window whenever you unlock
  if (game.pendingBuzz?.timer) clearTimeout(game.pendingBuzz.timer);
  game.pendingBuzz = null;
  game.buzzed = null;

  if (game.timeToBuzz === -1) return;

  ctx.startGameTimer(gameId, game, ctx, game.timeToBuzz, "buzz", ({ gameId, game }) => {
    if (!game) return;
    if (!game.selectedClue) return;

    // If still open and nobody buzzed => AI host resolves it
    if (game.buzzerLocked || game.buzzed) return;

    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    (async () => {
      const revealAnswer = async () => {
        game.selectedClue.isAnswerRevealed = true;
        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
      };

      const finish = async () => {
        const lockedPlayers = game.clueState?.lockedOut ?? {};

        for (const player of game.players) {
          const isLocked = lockedPlayers[player.username] === true;

          if (!isLocked) {
            ctx.fireAndForget(
              ctx.repos.profiles.incrementCluesSkipped(player.username),
              "incrementCluesSkipped",
            );
          }
        }

        await ctx.sleepAndCheckGame(1000, gameId);
        finishClueAndReturnToBoard(ctx, gameId, game);
      };

      const clueKey = ctx.getClueKey(game, game.selectedClue);
      const assetId = game.boardData?.ttsByAnswerKey?.[clueKey] || null;
      await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        { slot: "nobody", after: revealAnswer },
        { slot: "answer_was" },
        { assetId, after: finish },
      ]);
    })();
  });
}

export function findCategoryForClue(game, clue) {
  const boardKey = game.activeBoard || "firstBoard";
  const cats = game.boardData?.[boardKey]?.categories;
  if (!Array.isArray(cats)) return null;

  const v = clue?.value;
  const q = String(clue?.question ?? "").trim();
  if (!q) return null;

  for (const cat of cats) {
    const catName = String(cat?.category ?? "").trim();
    const values = Array.isArray(cat?.values) ? cat.values : [];
    for (const c of values) {
      const sameValue = c?.value === v;
      const sameQuestion = String(c?.question ?? "").trim() === q;
      if (sameValue && sameQuestion) return catName || null;
    }
  }

  return null;
}
