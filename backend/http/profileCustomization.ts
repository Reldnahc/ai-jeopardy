import type { CustomizationPatch } from "../repositories/profile/profile.types.js";
import { containsProfanity } from "../services/profanityService.js";
import { asTrimmedString } from "./profileRouteHelpers.js";

type CustomizationResult =
  | {
      ok: false;
      status: number;
      error: string;
    }
  | {
      ok: true;
      patch: CustomizationPatch;
    };

export function buildProfileCustomizationPatch(
  body: Record<string, unknown>,
): CustomizationResult {
  const patch: CustomizationPatch = {};

  if ("bio" in body) {
    patch.bio = body.bio === null ? null : asTrimmedString(body.bio);

    if (typeof patch.bio === "string" && patch.bio.length > 0 && containsProfanity(patch.bio)) {
      return { ok: false, status: 400, error: "Bio contains prohibited language." };
    }
  }

  if ("font" in body) patch.font = body.font === null ? null : asTrimmedString(body.font);
  if ("icon" in body) patch.icon = body.icon === null ? null : asTrimmedString(body.icon);

  if ("color" in body && body.color !== undefined) patch.color = asTrimmedString(body.color);
  if ("text_color" in body && body.text_color !== undefined)
    patch.text_color = asTrimmedString(body.text_color);
  if ("name_color" in body && body.name_color !== undefined)
    patch.name_color = asTrimmedString(body.name_color);
  if ("border" in body && body.border !== undefined) patch.border = asTrimmedString(body.border);
  if ("border_color" in body && body.border_color !== undefined)
    patch.border_color = asTrimmedString(body.border_color);
  if ("background" in body && body.background !== undefined)
    patch.background = asTrimmedString(body.background);
  if ("background_color" in body && body.background_color !== undefined)
    patch.background_color = asTrimmedString(body.background_color);

  return { ok: true, patch };
}
