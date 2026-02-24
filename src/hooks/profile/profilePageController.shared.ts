import type { LadderRole, Role } from "../../../shared/roles";
import { atLeast, normalizeRole, rank } from "../../../shared/roles";
import type { Profile as P } from "../../contexts/ProfileContext";

type CustomField =
  | "color"
  | "text_color"
  | "name_color"
  | "bio"
  | "font"
  | "icon"
  | "border"
  | "border_color"
  | "background_color";

export type CustomPatch = Partial<Pick<P, CustomField>>;
type ModerationField = "bio" | "role";
export type ModerationPatch = Partial<Pick<P, ModerationField>>;

export type PatchMeResponse = { profile?: P; error?: string };

export type ColorTarget = Extract<
  CustomField,
  "color" | "text_color" | "name_color" | "border_color" | "background_color"
>;

export const COLOR_TARGETS: Array<{ key: ColorTarget; label: string; defaultHex: string }> = [
  { key: "color", label: "Icon Background", defaultHex: "#3b82f6" },
  { key: "text_color", label: "Icon Color", defaultHex: "#ffffff" },
  { key: "name_color", label: "Name Color", defaultHex: "#3b82f6" },
  { key: "border_color", label: "Border Color", defaultHex: "#000000" },
  { key: "background_color", label: "Background Color", defaultHex: "#f2f2f2" },
];

export function getApiBase() {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

export function normalizeUsername(u: unknown) {
  return String(u ?? "")
    .trim()
    .toLowerCase();
}

export function toErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function normalizeHex(input: string, fallback: string) {
  const s = String(input ?? "").trim();
  if (!s) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
  return fallback;
}

export function asLadderRole(role: Role): LadderRole {
  return role === "banned" ? "default" : role;
}

export function useRoleGate(rawRole: unknown) {
  const role = normalizeRole(rawRole);
  const ladder = asLadderRole(role);
  return {
    role,
    ladder,
    atLeast: (min: LadderRole) => atLeast(ladder, min),
    rank: rank(ladder),
  };
}

export function prettyRoleLabel(r: string) {
  switch (r) {
    case "head_admin":
      return "Head Admin";
    default:
      return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function colorPatch(target: ColorTarget, value: string): Pick<P, ColorTarget> {
  return { [target]: value } as Pick<P, ColorTarget>;
}
