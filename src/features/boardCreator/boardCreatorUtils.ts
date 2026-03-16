import type { BoardData, Category, Clue } from "../../../shared/types/board.ts";

const FIRST_VALUES = [200, 400, 600, 800, 1000];
const SECOND_VALUES = [400, 800, 1200, 1600, 2000];

function makeRoundCategories(prefix: string, values: number[]): Category[] {
  return Array.from({ length: 5 }, (_, catIndex) => ({
    category: `${prefix} Category ${catIndex + 1}`,
    values: values.map((value, clueIndex) => ({
      value,
      question: `${prefix} clue ${catIndex + 1}-${clueIndex + 1}`,
      answer: `${prefix} answer ${catIndex + 1}-${clueIndex + 1}`,
    })),
  }));
}

export function makeTemplateBoard(): BoardData {
  return {
    firstBoard: {
      categories: makeRoundCategories("Jeopardy!", FIRST_VALUES),
    },
    secondBoard: {
      categories: makeRoundCategories("Double", SECOND_VALUES),
    },
    finalJeopardy: {
      categories: [
        {
          category: "Final Jeopardy",
          values: [
            {
              value: 0,
              question: "Final clue question",
              answer: "Final clue answer",
            },
          ],
        },
      ],
    },
  };
}

export function cloneBoard(board: BoardData): BoardData {
  return {
    firstBoard: {
      categories: board.firstBoard.categories.map((cat) => ({
        category: cat.category,
        values: cat.values.map((clue) => ({ ...clue })),
      })),
    },
    secondBoard: {
      categories: board.secondBoard.categories.map((cat) => ({
        category: cat.category,
        values: cat.values.map((clue) => ({ ...clue })),
      })),
    },
    finalJeopardy: {
      categories: board.finalJeopardy.categories.map((cat) => ({
        category: cat.category,
        values: cat.values.map((clue) => ({ ...clue })),
      })),
    },
  };
}

export function boardToPrettyJson(board: BoardData): string {
  return JSON.stringify(board, null, 2);
}

export function parseBoardFromJson(
  raw: string,
): { ok: true; board: BoardData } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Board JSON must be an object." };
    }
    const maybeBoard = parsed as Partial<BoardData>;
    if (!maybeBoard.firstBoard || !maybeBoard.secondBoard || !maybeBoard.finalJeopardy) {
      return { ok: false, error: "Missing firstBoard, secondBoard, or finalJeopardy." };
    }
    return { ok: true, board: parsed as BoardData };
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
}

export function validateBoard(board: BoardData): { ok: true } | { ok: false; error: string } {
  const checkRound = (
    roundName: string,
    categories: Category[],
    expectedCategoryCount: number,
    expectedClueCount: number,
  ): { ok: true } | { ok: false; error: string } => {
    if (!Array.isArray(categories) || categories.length !== expectedCategoryCount) {
      return {
        ok: false,
        error: `${roundName}.categories must be length ${expectedCategoryCount}.`,
      };
    }

    for (let i = 0; i < categories.length; i += 1) {
      const cat = categories[i];
      if (!String(cat.category ?? "").trim()) {
        return { ok: false, error: `${roundName}.categories[${i}].category is required.` };
      }
      if (!Array.isArray(cat.values) || cat.values.length !== expectedClueCount) {
        return {
          ok: false,
          error: `${roundName}.categories[${i}].values must be length ${expectedClueCount}.`,
        };
      }
      for (let j = 0; j < cat.values.length; j += 1) {
        const clue = cat.values[j] as Clue;
        if (!Number.isFinite(Number(clue.value))) {
          return {
            ok: false,
            error: `${roundName}.categories[${i}].values[${j}].value must be a number.`,
          };
        }
        if (!String(clue.question ?? "").trim()) {
          return {
            ok: false,
            error: `${roundName}.categories[${i}].values[${j}].question is required.`,
          };
        }
        if (!String(clue.answer ?? "").trim()) {
          return {
            ok: false,
            error: `${roundName}.categories[${i}].values[${j}].answer is required.`,
          };
        }
      }
    }

    return { ok: true };
  };

  const first = checkRound("firstBoard", board.firstBoard.categories, 5, 5);
  if (!first.ok) return first;
  const second = checkRound("secondBoard", board.secondBoard.categories, 5, 5);
  if (!second.ok) return second;

  if (!Array.isArray(board.finalJeopardy.categories) || board.finalJeopardy.categories.length < 1) {
    return { ok: false, error: "finalJeopardy.categories must include at least one category." };
  }
  const fjCategory = board.finalJeopardy.categories[0];
  if (!String(fjCategory.category ?? "").trim()) {
    return { ok: false, error: "finalJeopardy.categories[0].category is required." };
  }
  if (!Array.isArray(fjCategory.values) || fjCategory.values.length < 1) {
    return {
      ok: false,
      error: "finalJeopardy.categories[0].values must include at least one clue.",
    };
  }
  const fjClue = fjCategory.values[0];
  if (!String(fjClue.question ?? "").trim()) {
    return { ok: false, error: "finalJeopardy.categories[0].values[0].question is required." };
  }
  if (!String(fjClue.answer ?? "").trim()) {
    return { ok: false, error: "finalJeopardy.categories[0].values[0].answer is required." };
  }

  return { ok: true };
}
