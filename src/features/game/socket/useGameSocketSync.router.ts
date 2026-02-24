import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";
import { routeAnswerMessage } from "./useGameSocketSync.router.answer.ts";
import { routeAudioMessage } from "./useGameSocketSync.router.audio.ts";
import { routeBoardMessage } from "./useGameSocketSync.router.board.ts";
import { routeSnapshotMessage } from "./useGameSocketSync.router.snapshot.ts";

export function routeGameSocketMessage(message: SocketMessage, deps: GameSocketRouterDeps): void {
  if (routeSnapshotMessage(message, deps)) return;
  if (routeAnswerMessage(message, deps)) return;
  if (routeAudioMessage(message, deps)) return;
  routeBoardMessage(message, deps);
}
