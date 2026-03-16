import type {
  BenchmarkBoard,
  ClassifierResult,
  FlattenedClue,
  ScoredClue,
} from "./boardBenchmarkWorkflow.types.js";

export function flattenBoardClues(
  board: BenchmarkBoard,
  boardSetId: string,
  workflowName: string,
): FlattenedClue[] {
  const clues: FlattenedClue[] = [];

  for (const sectionName of ["firstBoard", "secondBoard", "finalJeopardy"] as const) {
    const categories = board[sectionName].categories;
    categories.forEach((category, categoryIndex) => {
      category.values.forEach((clue, clueIndex) => {
        clues.push({
          board_set_id: boardSetId,
          workflow: workflowName,
          board_type: sectionName,
          category_index: categoryIndex,
          clue_index: clueIndex,
          category: clue.category,
          value: clue.value,
          question: clue.question,
          answer: clue.answer,
        });
      });
    });
  }

  return clues;
}

export function classifierBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

export async function callBoardClassifier(
  endpoint: string,
  clues: FlattenedClue[],
  fetchImpl: typeof fetch = fetch,
): Promise<ClassifierResult[]> {
  const payload = clues.map((clue) => ({
    category: clue.category,
    question: clue.question,
    answer: clue.answer,
  }));

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Classifier request failed with status ${response.status}.`);
  }

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== clues.length) {
    throw new Error("Classifier returned an invalid response.");
  }

  return parsed as ClassifierResult[];
}

export async function scoreBoardClues(args: {
  endpoint: string;
  clues: FlattenedClue[];
  batchSize: number;
  fetchImpl?: typeof fetch;
}): Promise<ScoredClue[]> {
  const scoredClues: ScoredClue[] = [];

  for (const batch of classifierBatches(args.clues, args.batchSize)) {
    const results = await callBoardClassifier(args.endpoint, batch, args.fetchImpl);
    batch.forEach((clue, index) => {
      const result = results[index];
      scoredClues.push({
        ...clue,
        classifier_valid: result?.valid,
        classifier_confidence: result?.confidence ?? null,
        classifier_reason: result?.reason ?? null,
      });
    });
  }

  return scoredClues;
}
