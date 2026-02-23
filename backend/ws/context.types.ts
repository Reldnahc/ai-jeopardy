import type { WsContext } from "../types/runtime.js";
import type { LoosenContextFns, RepoFns } from "./context.unsafe-types.js";

export type Trace = {
  mark?: (name: string, data?: Record<string, unknown>) => void;
};

export type AsyncLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

export type EnsureTtsAssetParams = {
  text: string;
  textType: "text";
  voiceId: string;
  engine: string;
  outputFormat: string;
  provider: string;
};

export type AiHostTtsBank = {
  slotAssets: Record<string, string[]>;
  nameAssetsByPlayer: Record<string, string>;
  categoryAssetsByCategory: Record<string, string>;
  valueAssetsByValue: Record<string, string>;
  finalJeopardyAnswersByPlayer: Record<string, string>;
  finalJeopardyWagersByPlayer: Record<string, string>;
  allAssetIds: string[];
};

export type Player = {
  username?: string | null;
  displayname?: string | null;
};

export type Category =
  | string
  | {
      name?: string | null;
      category?: string | null;
    };

type ActiveBoard = "firstBoard" | "secondBoard" | "finalJeopardy";
type BoardDataLike = {
  firstBoard?: { categories?: Array<{ values?: Array<{ value?: unknown }> }> };
  secondBoard?: { categories?: Array<{ values?: Array<{ value?: unknown }> }> };
};

export type Game = {
  lobbySettings?: { narrationEnabled?: boolean | null } | null;
  players?: Player[] | null;
  categories?: Category[] | null;
  boardData?: BoardDataLike;
  aiHostTts?: AiHostTtsBank | null;
  activeBoard?: ActiveBoard;
  ttsProvider?: string | null;
};

type CtxRepos = Record<string, unknown> & {
  profiles: RepoFns;
  boards: RepoFns;
  images?: RepoFns;
  tts?: RepoFns;
};

export type Ctx = Omit<LoosenContextFns<WsContext>, "repos" | "numberToWords"> & {
  repos: CtxRepos;
  numberToWords: (value: number) => string;
};

export type SayResult = { assetId: string; ms: number };

export type VoiceStep = {
  slot?: string;
  assetId?: string;
  pad?: number;
  after?: () => void | Promise<void>;
};
