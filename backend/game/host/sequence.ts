import type { CtxDeps, Game, VoiceStep } from "../../ws/context.types.js";
import { aiHostSayByAsset, aiHostSayByKey, type HostPlaybackCtx } from "./playback.js";

export type HostSequenceCtx = HostPlaybackCtx & CtxDeps<"sleepAndCheckGame">;

export async function aiHostVoiceSequence(
  ctx: HostSequenceCtx,
  gameId: string,
  game: Game,
  steps: VoiceStep[],
): Promise<boolean> {
  for (const step of steps) {
    const said = step.slot
      ? await aiHostSayByKey(ctx, gameId, game, step.slot)
      : await aiHostSayByAsset(ctx, gameId, game, step.assetId);

    const ms = said?.ms ?? 0;
    const alive = await ctx.sleepAndCheckGame(ms + (step.pad ?? 0), gameId);
    if (!alive) return false;

    if (typeof step.after === "function") {
      await step.after();
    }
  }
  return true;
}
