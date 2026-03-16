import type { BoardData } from "../../../../shared/types/board.js";
import type { VisualSettings } from "../visuals.js";
import type { Ctx } from "../../../ws/context.types.js";
import type { Board } from "../../../http/boardRoutes.js";
import { makeProgressReporter } from "./boardTelemetry.js";

export type CreateBoardOptions = Partial<VisualSettings> & {
  reasoningEffort?: "off" | "low" | "medium" | "high";
  narrationEnabled?: boolean;
  ttsVoiceId?: string;
  onProgress?: (p: { done: number; total: number; progress: number }) => void;
  onTtsReady?: (assetId: string) => void;
  trace?: { mark: (event: string, meta?: Record<string, unknown>) => void };
};

export type ResolvedCreateBoardSettings = Required<
  Omit<CreateBoardOptions, "onProgress" | "onTtsReady" | "trace">
> &
  Pick<CreateBoardOptions, "onProgress" | "onTtsReady" | "trace">;

type TrackableTtsState = { ttsPromises: Promise<unknown>[] };
type ProgressReporter = ReturnType<typeof makeProgressReporter>;

function buildClueKey(boardKey: "firstBoard" | "secondBoard", value: unknown, question: unknown) {
  const v = String(value ?? "");
  const q = String(question ?? "").trim();
  return `${boardKey}:${v}:${q}`;
}

function pickRandomDistinct<T>(values: T[], count: number): T[] {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

function collectClueKeys(
  boardKey: "firstBoard" | "secondBoard",
  board: { categories: Array<{ values: Array<{ value: unknown; question: unknown }> }> },
) {
  const clueKeys: string[] = [];
  for (const category of board?.categories ?? []) {
    for (const clue of category?.values ?? []) {
      clueKeys.push(buildClueKey(boardKey, clue?.value, clue?.question));
    }
  }
  return clueKeys;
}

export function resolveCreateBoardSettings(
  options: CreateBoardOptions = {},
): ResolvedCreateBoardSettings {
  return {
    includeVisuals: false,
    imageProvider: "commons",
    maxVisualCluesPerCategory: 2,
    maxImageSearchTries: 6,
    commonsThumbWidth: 1600,
    preferPhotos: true,
    reasoningEffort: "off",
    narrationEnabled: false,
    ttsVoiceId: "kokoro:af_heart",
    onProgress: undefined,
    onTtsReady: undefined,
    trace: undefined,
    ...options,
  } satisfies ResolvedCreateBoardSettings;
}

export function toBoardVisualSettings(settings: ResolvedCreateBoardSettings): VisualSettings {
  return {
    includeVisuals: settings.includeVisuals,
    imageProvider: settings.imageProvider,
    maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
    maxImageSearchTries: settings.maxImageSearchTries,
    commonsThumbWidth: settings.commonsThumbWidth,
    preferPhotos: settings.preferPhotos,
  };
}

export function trackNewTtsPromises(
  ttsState: TrackableTtsState,
  progress: ProgressReporter,
  beforeLength: number,
) {
  for (let i = beforeLength; i < ttsState.ttsPromises.length; i++) {
    const promise = ttsState.ttsPromises[i];
    ttsState.ttsPromises[i] = Promise.resolve(promise).finally(() => {
      progress.tick(1);
    });
  }
}

export function buildDailyDoubleClueKeys(args: {
  firstBoard: BoardData["firstBoard"];
  secondBoard: BoardData["secondBoard"];
}) {
  const firstKeys = collectClueKeys("firstBoard", args.firstBoard);
  const secondKeys = collectClueKeys("secondBoard", args.secondBoard);

  return {
    firstBoard: pickRandomDistinct(firstKeys, 1),
    secondBoard: pickRandomDistinct(secondKeys, 2),
  };
}

export async function saveBoardAsync(ctx: Ctx, host: string, board: Board) {
  try {
    const normalizedHost = String(host ?? "")
      .toLowerCase()
      .trim();
    const ownerId = await ctx.repos.profiles.getIdByUsername(normalizedHost);
    if (!ownerId) return;

    await ctx.repos.boards.insertBoard(ownerId, board);
    await ctx.repos.profiles.incrementBoardsGenerated(normalizedHost);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Board] saveBoardAsync failed:", message);
  }
}
