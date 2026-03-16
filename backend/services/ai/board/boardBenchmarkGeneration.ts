import {
  buildCategoryPromptFromWorkflow,
  buildFinalPromptFromWorkflow,
  type BenchmarkPromptWorkflow,
  valuesFor,
} from "./boardPromptTemplates.js";
import type {
  BenchmarkBoard,
  BoardSectionName,
  FinalCategory,
  RequestUsage,
  RegularCategory,
} from "./boardBenchmarkWorkflow.types.js";
import type { Provider } from "../../../../shared/models.js";

export type BoardGenerationJob = {
  section: BoardSectionName;
  index: number;
  categoryName: string;
  prompt: string;
  normalize: (data: unknown) => RegularCategory | FinalCategory;
};

export type BoardGenerationResult = {
  section: BoardSectionName;
  index: number;
  categoryName: string;
  category: RegularCategory | FinalCategory;
  usage: RequestUsage;
};

function requireBenchmarkString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeRegularCategory(data: unknown, expectedValues: number[]): RegularCategory {
  if (!data || typeof data !== "object") {
    throw new Error("Regular category response must be a JSON object.");
  }

  const record = data as { category?: unknown; values?: unknown };
  const category = requireBenchmarkString(record.category, "category");
  if (!Array.isArray(record.values) || record.values.length !== 5) {
    throw new Error("Regular category must contain exactly 5 values.");
  }

  return {
    category,
    values: record.values.map((clue, index) => {
      if (!clue || typeof clue !== "object") {
        throw new Error(`Clue ${index} must be a JSON object.`);
      }

      const typed = clue as { value?: unknown; question?: unknown; answer?: unknown };
      if (typed.value !== expectedValues[index]) {
        throw new Error(
          `Clue ${index} value must be ${expectedValues[index]}, got ${String(typed.value)}.`,
        );
      }

      return {
        value: expectedValues[index],
        question: requireBenchmarkString(typed.question, `clue ${index} question`),
        answer: requireBenchmarkString(typed.answer, `clue ${index} answer`),
        category,
      };
    }),
  };
}

function normalizeFinalCategory(data: unknown): FinalCategory {
  if (!data || typeof data !== "object") {
    throw new Error("Final category response must be a JSON object.");
  }

  const record = data as { category?: unknown; values?: unknown };
  const category = requireBenchmarkString(record.category, "category");
  if (!Array.isArray(record.values) || record.values.length !== 1) {
    throw new Error("Final category must contain exactly 1 clue.");
  }

  const clue = record.values[0];
  if (!clue || typeof clue !== "object") {
    throw new Error("Final clue must be a JSON object.");
  }

  const typed = clue as { question?: unknown; answer?: unknown };
  return {
    category,
    values: [
      {
        value: 0,
        question: requireBenchmarkString(typed.question, "final clue question"),
        answer: requireBenchmarkString(typed.answer, "final clue answer"),
        category,
      },
    ],
  };
}

export function normalizeBoardSetCategories(
  boardSetId: string,
  categories: unknown,
): string[] {
  if (!Array.isArray(categories) || categories.length !== 11) {
    throw new Error(`${boardSetId} must contain exactly 11 categories.`);
  }

  return categories.map((item, index) =>
    requireBenchmarkString(item, `${boardSetId}.categories[${index}]`),
  );
}

export function buildBoardGenerationJobs(
  categories: string[],
  workflow: BenchmarkPromptWorkflow,
  configDir: string,
): BoardGenerationJob[] {
  if (categories.length !== 11) {
    throw new Error("Board generation requires exactly 11 categories.");
  }

  const firstCategories = categories.slice(0, 5);
  const secondCategories = categories.slice(5, 10);
  const finalCategory = categories[10];

  return [
    ...firstCategories.map((category, index) => ({
      section: "firstBoard" as const,
      index,
      categoryName: category,
      prompt: buildCategoryPromptFromWorkflow(category, false, workflow, configDir),
      normalize: (data: unknown) => normalizeRegularCategory(data, valuesFor(false)),
    })),
    ...secondCategories.map((category, index) => ({
      section: "secondBoard" as const,
      index,
      categoryName: category,
      prompt: buildCategoryPromptFromWorkflow(category, true, workflow, configDir),
      normalize: (data: unknown) => normalizeRegularCategory(data, valuesFor(true)),
    })),
    {
      section: "finalJeopardy" as const,
      index: 0,
      categoryName: finalCategory,
      prompt: buildFinalPromptFromWorkflow(finalCategory, workflow, configDir),
      normalize: normalizeFinalCategory,
    },
  ];
}

function createEmptyBoardSections() {
  return {
    firstBoard: new Array<RegularCategory>(5),
    secondBoard: new Array<RegularCategory>(5),
    finalJeopardy: new Array<FinalCategory>(1),
  };
}

export function buildGeneratedBoard(args: {
  boardSetId: string;
  workflowName: string;
  provider: Provider;
  model: string;
  categories: string[];
  results: BoardGenerationResult[];
}): BenchmarkBoard & { requestUsage: RequestUsage[] } {
  const sections = createEmptyBoardSections();

  for (const result of args.results) {
    if (result.section === "finalJeopardy") {
      sections.finalJeopardy[result.index] = result.category as FinalCategory;
    } else if (result.section === "firstBoard") {
      sections.firstBoard[result.index] = result.category as RegularCategory;
    } else {
      sections.secondBoard[result.index] = result.category as RegularCategory;
    }
  }

  return {
    board_set_id: args.boardSetId,
    workflow: args.workflowName,
    provider: args.provider,
    model: args.model,
    categories: args.categories,
    firstBoard: { categories: sections.firstBoard },
    secondBoard: { categories: sections.secondBoard },
    finalJeopardy: { categories: sections.finalJeopardy },
    requestUsage: args.results.map((result) => result.usage),
  };
}
