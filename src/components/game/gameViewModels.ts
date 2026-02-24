import type {
  AnswerCaptureStartMsg,
  AnswerProcessingMsg,
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
} from "../../features/game/socket/useGameSocketSync.types.ts";

export type BuzzUiState = {
  buzzerLocked: boolean;
  buzzResult: string | null;
  buzzResultDisplay: string | null;
  buzzLockedOut: boolean;
  hasBuzzedCurrentClue: boolean;
};

export type TimerUiState = {
  timerEndTime: number | null;
  timerDuration: number;
};

export type AnswerUiState = {
  answerCapture: AnswerCaptureStartMsg | null;
  answerError: string | null;
  answerProcessing: AnswerProcessingMsg | null;
  myUsername: string | null;
};

export type FinalUiState = {
  finalWagers: Record<string, number>;
  selectedFinalist: string;
  showWager: boolean;
  finalists: string[];
};

export type DailyDoubleUiState = {
  ddWagerCapture: DailyDoubleWagerCaptureStartMsg | null;
  ddWagerError: string | null;
  showDdModal: DailyDoubleShowModalMsg | null;
};
