import type React from "react";
import type { Profile as P } from "../contexts/ProfileContext";
import { type ProfileIconName } from "../components/common/profileIcons";

function isHexColor(s: unknown): s is string {
    return typeof s === "string" && /^#([0-9a-fA-F]{6})$/.test(s);
}

export const PROFILE_COLOR_OPTIONS = [
    "#3b82f6", "#6366f1", "#06b6d4", "#0ea5e9",
    "#22c55e", "#10b981", "#14b8a6", "#84cc16",
    "#eab308", "#f59e0b", "#f97316", "#ef4444",
    "#f43f5e", "#ec4899", "#d946ef", "#a855f7",
    "#8b5cf6", "#6b7280", "#78716c", "#64748b",
    "#71717a", "#000000", "#ffffff",
] as const;


export const PROFILE_FONT_OPTIONS = [
    // System / Base
    { id: "inter", label: "Inter", css: "font-inter" },
    { id: "serif", label: "Serif", css: "font-serif" },
    { id: "mono", label: "Mono", css: "font-mono" },

    // Clean
    { id: "outfit", label: "Outfit", css: "font-outfit" },
    { id: "dmsans", label: "DM Sans", css: "font-dmsans" },
    { id: "jetbrains", label: "JetBrains Mono", css: "font-jetbrains" },

    // Tech / Futuristic
    { id: "orbitron", label: "Orbitron", css: "font-orbitron" },
    { id: "audiowide", label: "Audiowide", css: "font-audiowide" },
    { id: "majormono", label: "Major Mono Display", css: "font-majormono" },
    { id: "pressstart", label: "Press Start 2P", css: "font-pressstart" },

    // Cute / Rounded
    { id: "fredoka", label: "Fredoka", css: "font-fredoka" },
    { id: "baloo", label: "Baloo 2", css: "font-baloo" },
    { id: "comfortaa", label: "Comfortaa", css: "font-comfortaa" },
    { id: "chewy", label: "Chewy", css: "font-chewy" },

    // Script / Handwritten
    { id: "pacifico", label: "Pacifico", css: "font-pacifico" },
    { id: "cherry", label: "Cherry Bomb One", css: "font-cherry" },
    { id: "gloria", label: "Gloria Hallelujah", css: "font-gloria" },

    // Loud / Display
    { id: "bungee", label: "Bungee", css: "font-bungee" },
    { id: "luckiest", label: "Luckiest Guy", css: "font-luckiest" },

    // Chaos Tier
    { id: "rubikglitch", label: "Rubik Glitch", css: "font-rubikglitch" },
    { id: "creepster", label: "Creepster", css: "font-creepster" },
    { id: "metalmania", label: "Metal Mania", css: "font-metalmania" },
] as const;


const FONT_CLASS_MAP: Record<string, string> =
    Object.fromEntries(
        PROFILE_FONT_OPTIONS.map(f => [f.id, f.css])
    );


export type ProfilePresentation = {
    displayName: string;

    nameClassName: string;              // font class
    nameStyle?: React.CSSProperties;    // name color

    avatar: {
        nameForLetter: string;            // what Avatar uses for "letter"
        icon: ProfileIconName;
        bgColor: string | null | undefined;
        fgColor: string | null | undefined; // text/icon color
    };

    // useful when rendering ProfileIcon directly (like your icon picker)
    iconColorClass: string;             // tailwind "text-..." if used
    iconColorStyle?: React.CSSProperties; // { color: "#..." } if hex
};

export function getProfilePresentation(args: {
    profile?: P | null;
    fallbackName?: string; // if profile missing, use auth user displayname/username etc.
    defaultNameColor?: string; // optional override per context
}): ProfilePresentation {
    const { profile, fallbackName = "", defaultNameColor } = args;

    const displayName = profile?.displayname || profile?.username || fallbackName || "";

    const fontId = profile?.font ?? "";
    const nameClassName = FONT_CLASS_MAP[fontId] ?? "font-sans";

    const nameColor = profile?.name_color ?? defaultNameColor ?? "#ffffff";
    const nameStyle = isHexColor(nameColor) ? ({ color: nameColor } as React.CSSProperties) : undefined;

    const fg = profile?.text_color ?? "#ffffff";
    const iconColorStyle = isHexColor(fg) ? ({ color: fg } as React.CSSProperties) : undefined;
    const iconColorClass = isHexColor(fg) ? "" : String(fg || "").trim(); // if you ever allow tailwind text-...

    const icon = (profile?.icon ?? "letter") as ProfileIconName;

    return {
        displayName,
        nameClassName,
        nameStyle,

        avatar: {
            nameForLetter: displayName, // Avatar uses initial from this
            icon,
            bgColor: profile?.color ?? "#3b82f6",
            fgColor: fg,
        },

        iconColorClass,
        iconColorStyle,
    };
}
