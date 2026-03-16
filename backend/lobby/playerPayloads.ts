import type { PlayerState } from "../types/runtime.js";

export type PlayerPayload = {
  username: string;
  displayname: string;
  online: boolean;
};

export function toPlayerPayload(player: PlayerState): PlayerPayload {
  return {
    username: String(player.username ?? ""),
    displayname: String(player.displayname ?? ""),
    online: player.online !== false,
  };
}

export function toPlayerPayloads(players: PlayerState[] | null | undefined): PlayerPayload[] {
  return (players ?? []).map((player) => toPlayerPayload(player));
}
