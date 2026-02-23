type JsonMap = Record<string, unknown>;
type ValidateResult = { ok: true } | { ok: false; error: string };
type ClueShape = { value: number; question: string; answer: string };
type CategoryShape = { category: string; values: ClueShape[] };
type RoundShape = { categories: CategoryShape[] };
type FinalJeopardyShape = { categories: CategoryShape | CategoryShape[] };
type BoardShape = {
  firstBoard: RoundShape;
  secondBoard: RoundShape;
  finalJeopardy: FinalJeopardyShape;
};

const isCategoryShape = (value: unknown): value is CategoryShape => {
  if (!value || typeof value !== "object") return false;
  const v = value as JsonMap;
  return isNonEmptyString(v.category) && Array.isArray(v.values);
};

export const normalizeCategories11 = (arr: unknown): string[] => {
  const next = Array.isArray(arr) ? arr.slice(0, 11) : [];
  while (next.length < 11) next.push("");
  return next.map((v) => String(v ?? ""));
};

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export const validateImportedBoardData = (boardData: unknown): ValidateResult => {
  // Accept either:
  // 1) { firstBoard, secondBoard, finalJeopardy }
  // 2) { version, firstBoard, secondBoard, finalJeopardy }
  const b = boardData && typeof boardData === "object" ? (boardData as Partial<BoardShape>) : null;
  if (!b) return { ok: false, error: "Board JSON must be an object." };

  const firstBoard = b.firstBoard as RoundShape | undefined;
  const secondBoard = b.secondBoard as RoundShape | undefined;
  const finalJeopardy = b.finalJeopardy as FinalJeopardyShape | undefined;

  if (!firstBoard || !secondBoard || !finalJeopardy) {
    return { ok: false, error: "Missing firstBoard, secondBoard, or finalJeopardy." };
  }

  const fbCats = firstBoard.categories;
  const sbCats = secondBoard.categories;

  if (!Array.isArray(fbCats) || fbCats.length !== 5) {
    return { ok: false, error: "firstBoard.categories must be an array of length 5." };
  }
  if (!Array.isArray(sbCats) || sbCats.length !== 5) {
    return { ok: false, error: "secondBoard.categories must be an array of length 5." };
  }

  const validateRoundCategories = (cats: unknown[], roundName: string): string | null => {
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i] as JsonMap;
      if (!isCategoryShape(c)) return `${roundName}.categories[${i}] must be an object.`;
      if (!isNonEmptyString(c.category))
        return `${roundName}.categories[${i}].category must be a non-empty string.`;
      if (!Array.isArray(c.values) || c.values.length !== 5)
        return `${roundName}.categories[${i}].values must be an array of length 5.`;

      for (let j = 0; j < c.values.length; j++) {
        const clue = c.values[j] as JsonMap;
        if (!clue || typeof clue !== "object")
          return `${roundName}.categories[${i}].values[${j}] must be an object.`;
        if (typeof clue.value !== "number")
          return `${roundName}.categories[${i}].values[${j}].value must be a number.`;
        if (!isNonEmptyString(clue.question))
          return `${roundName}.categories[${i}].values[${j}].question must be a non-empty string.`;
        if (!isNonEmptyString(clue.answer))
          return `${roundName}.categories[${i}].values[${j}].answer must be a non-empty string.`;
      }
    }
    return null;
  };

  const fbErr = validateRoundCategories(fbCats, "firstBoard");
  if (fbErr) return { ok: false, error: fbErr };

  const sbErr = validateRoundCategories(sbCats, "secondBoard");
  if (sbErr) return { ok: false, error: sbErr };

  // finalJeopardy.categories can be either object or array[0]
  let fjCats = finalJeopardy.categories;
  if (!fjCats) return { ok: false, error: "finalJeopardy.categories is required." };

  if (Array.isArray(fjCats)) {
    if (fjCats.length < 1)
      return { ok: false, error: "finalJeopardy.categories must have at least 1 category." };
    fjCats = fjCats[0];
  }

  if (!isCategoryShape(fjCats)) {
    return { ok: false, error: "finalJeopardy.categories must be an object or an array." };
  }

  if (!isNonEmptyString(fjCats.category)) {
    return { ok: false, error: "finalJeopardy.categories.category must be a non-empty string." };
  }

  if (!Array.isArray(fjCats.values) || fjCats.values.length < 1) {
    return {
      ok: false,
      error: "finalJeopardy.categories.values must be an array with at least 1 clue.",
    };
  }

  const fj = fjCats.values[0] as JsonMap;
  if (!fj || typeof fj !== "object")
    return { ok: false, error: "finalJeopardy.categories.values[0] must be an object." };
  if (!isNonEmptyString(fj.question))
    return {
      ok: false,
      error: "finalJeopardy.categories.values[0].question must be a non-empty string.",
    };
  if (!isNonEmptyString(fj.answer))
    return {
      ok: false,
      error: "finalJeopardy.categories.values[0].answer must be a non-empty string.",
    };

  return { ok: true };
};

export const parseBoardJson = (raw: unknown): unknown => {
  let parsed: unknown;
  if (typeof raw === "string") parsed = JSON.parse(raw);
  else parsed = raw;

  if (parsed && typeof parsed === "object") {
    const container = parsed as { boardData?: unknown };
    if (container.boardData && typeof container.boardData === "object") {
      return container.boardData;
    }
  }
  return parsed;
};
