import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";
import { routeLobbyControlMessage } from "./useLobbySocketSync.router.control.ts";
import { routeLobbyPreloadMessage } from "./useLobbySocketSync.router.preload.ts";
import { routeLobbySnapshotMessage } from "./useLobbySocketSync.router.snapshot.ts";

export function routeLobbySocketMessage(message: LobbySocketMessage, deps: LobbySocketRouterDeps) {
  if (routeLobbySnapshotMessage(message, deps)) return;
  if (routeLobbyPreloadMessage(message, deps)) return;
  routeLobbyControlMessage(message, deps);
}
