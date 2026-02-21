// src/components/profile/ProfileCustomizationPanel.tsx
import React from "react";
import ProfileIcon from "../common/ProfileIcon";
import { PROFILE_ICON_OPTIONS } from "../common/profileIcons";
import {
  BORDER_PRESETS,
  getBorderStyle,
  PROFILE_COLOR_OPTIONS,
  PROFILE_FONT_OPTIONS,
} from "../../utils/profilePresentation.ts";
import type { ProfilePresentation } from "../../utils/profilePresentation.ts";
import type { Profile as P } from "../../contexts/ProfileContext";
import {
  COLOR_TARGETS,
  normalizeHex,
  type ColorTarget,
  type CustomPatch,
} from "../../hooks/profile/useProfilePageController";

type Props = {
  token: string | null | undefined;

  routeProfile: P;
  pres: ProfilePresentation;

  colorTarget: ColorTarget;
  setColorTarget: (v: ColorTarget) => void;

  hexDraft: string;
  setHexDraft: React.Dispatch<React.SetStateAction<string>>;

  cancelHexDraft: () => void;
  commitHexDraft: () => Promise<void>;

  saveCustomization: (patch: CustomPatch) => Promise<void>;
  nameHexForFontPreview: string;
};

export default function ProfileCustomizationPanel({
  token,
  routeProfile,
  pres,
  colorTarget,
  setColorTarget,
  hexDraft,
  setHexDraft,
  cancelHexDraft,
  commitHexDraft,
  saveCustomization,
  nameHexForFontPreview,
}: Props) {
  if (!token) {
    return <p className="text-gray-600">Log in to edit your profile colors.</p>;
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-6">
      {/* Colors */}
      <div>
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Colors</h3>

        <div className="flex flex-wrap gap-2 mb-3">
          {COLOR_TARGETS.map((t) => {
            const active = colorTarget === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setColorTarget(t.key)}
                className={[
                  "px-3 py-2 rounded-lg border",
                  "text-sm font-semibold transition-colors",
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[auto,auto,1fr,auto] items-center gap-3 mb-3">
          <input
            type="color"
            value={normalizeHex(hexDraft, "#3b82f6")}
            onChange={(e) => {
              const meta = COLOR_TARGETS.find((x) => x.key === colorTarget)!;
              const next = normalizeHex(e.target.value, meta.defaultHex);
              setHexDraft(next);
            }}
            className="w-12 h-10 p-1 rounded-md border border-gray-300 bg-white cursor-pointer"
            aria-label="Pick color"
            title="Pick color"
          />

          <input
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitHexDraft();
              if (e.key === "Escape") cancelHexDraft();
            }}
            className="w-36 rounded-md border border-gray-300 p-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="#3b82f6"
            aria-label="Hex color"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelHexDraft}
              className="px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void commitHexDraft()}
              className="px-3 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PROFILE_COLOR_OPTIONS.map((c) => {
            const meta = COLOR_TARGETS.find((x) => x.key === colorTarget)!;
            const normalized = normalizeHex(c, meta.defaultHex);
            const selected = normalizeHex(hexDraft, meta.defaultHex) === normalized;

            return (
              <button
                key={`${colorTarget}-${c}`}
                type="button"
                className={[
                  "w-8 h-8 rounded-full border border-gray-300 cursor-pointer",
                  selected ? "ring-4 ring-blue-400" : "",
                ].join(" ")}
                style={{ backgroundColor: normalized }}
                onClick={() => setHexDraft(normalized)}
                aria-label={`Set ${colorTarget} to ${normalized}`}
                title={normalized}
              />
            );
          })}
        </div>
      </div>

      {/* Icon */}
      <div>
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Icon</h3>

        <div className="flex flex-wrap gap-2">
          {PROFILE_ICON_OPTIONS.map((icon) => {
            const selected = (routeProfile.icon ?? "letter") === icon;

            return (
              <button
                key={icon}
                type="button"
                className={[
                  "w-11 h-11 rounded-lg border border-gray-300",
                  "flex items-center justify-center",
                  "bg-white hover:bg-gray-50",
                  selected ? "ring-4 ring-blue-400" : "",
                ].join(" ")}
                onClick={() => void saveCustomization({ icon })}
                aria-label={`Set icon ${icon}`}
                title={icon}
              >
                {icon === "letter" ? (
                  <span className={pres.iconColorClass} style={pres.iconColorStyle}>
                    {pres.displayName?.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <ProfileIcon
                    name={icon}
                    className={["w-6 h-6", pres.iconColorClass].join(" ").trim()}
                    style={pres.iconColorStyle}
                    title={icon}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Font */}
      <div>
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Font</h3>
        <div className="flex flex-wrap gap-2">
          {PROFILE_FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={[
                "px-3 py-2 rounded-lg border border-gray-300",
                "bg-white hover:bg-gray-50",
                "text-sm font-semibold",
                routeProfile.font === f.id ? "ring-4 ring-blue-400" : "",
              ].join(" ")}
              onClick={() => void saveCustomization({ font: f.id })}
            >
              <span className={f.css} style={{ color: nameHexForFontPreview }}>
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Border */}
      <div>
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Border</h3>

        {(() => {
          const borderHex = normalizeHex(String(routeProfile.border_color ?? "#000000"), "#000000");

          return (
            <div className="flex flex-wrap gap-2">
              {BORDER_PRESETS.map((b) => {
                const selected = (routeProfile.border ?? "none") === b.id;

                const previewStyle =
                  b.id === "none"
                    ? ({
                        border: "1px solid",
                        borderColor: "#d1d5db",
                      } as React.CSSProperties)
                    : (getBorderStyle(b.id, borderHex) ??
                      ({
                        border: "1px solid",
                        borderColor: borderHex,
                      } as React.CSSProperties));

                return (
                  <button
                    key={b.id}
                    type="button"
                    className={[
                      "px-3 py-2 rounded-lg bg-white",
                      "text-sm font-semibold",
                      "hover:bg-gray-50",
                      "transition",
                      selected ? "ring-4 ring-blue-400" : "",
                    ].join(" ")}
                    style={previewStyle}
                    onClick={() => void saveCustomization({ border: b.id })}
                    title={b.label}
                  >
                    <span style={{ color: borderHex }}>{b.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
