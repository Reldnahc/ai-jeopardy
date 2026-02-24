import { useMemo } from "react";
import type { Player } from "../types/Lobby";

export function useUniqueUsernames(players: Player[]) {
  return useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      const u = String(p.username ?? "").trim();
      if (u) set.add(u);
    }
    return Array.from(set);
  }, [players]);
}
