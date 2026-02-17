import type React from "react";
import type { Profile as P } from "../contexts/ProfileContext";
import { type ProfileIconName } from "../components/common/profileIcons";

function isHexColor(s: unknown): s is string {
    return typeof s === "string" && /^#([0-9a-fA-F]{6})$/.test(s);
}

export const PROFILE_COLOR_OPTIONS = [
    "#1d4ed8", "#1e40af", "#2563eb", "#0284c7", "#0369a1",
    "#0891b2", "#0f766e", "#15803d", "#166534", "#16a34a",
    "#65a30d", "#a3e635", "#ca8a04", "#facc15", "#ea580c",
    "#c2410c", "#b91c1c", "#991b1b", "#dc2626", "#be185d",
    "#9d174d", "#7e22ce", "#581c87", "#9333ea", "#c084fc",
    "#93c5fd", "#bfdbfe", "#c4b5fd", "#f9a8d4", "#fda4af",
    "#1f2937", "#111827", "#374151", "#4b5563"
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
    { id: "sora", label: "Sora", css: "font-sora" },
    { id: "exo2", label: "Exo 2", css: "font-exo2" },
    { id: "kanit", label: "Kanit", css: "font-kanit" },
    { id: "rajdhani", label: "Rajdhani", css: "font-rajdhani" },
    { id: "teko", label: "Teko", css: "font-teko" },

    // Tech / Futuristic
    { id: "orbitron", label: "Orbitron", css: "font-orbitron" },
    { id: "audiowide", label: "Audiowide", css: "font-audiowide" },
    { id: "majormono", label: "Major Mono Display", css: "font-majormono" },
    { id: "pressstart", label: "Press Start 2P", css: "font-pressstart" },
    { id: "silkscreen", label: "Silkscreen", css: "font-silkscreen" },
    { id: "vt323", label: "VT323", css: "font-vt323" },
    { id: "monoton", label: "Monoton", css: "font-monoton" },
    { id: "blackops", label: "Black Ops One", css: "font-blackops" },
    { id: "codystar", label: "Codystar", css: "font-codystar" },

    // Cute / Rounded
    { id: "fredoka", label: "Fredoka", css: "font-fredoka" },
    { id: "baloo", label: "Baloo 2", css: "font-baloo" },
    { id: "comfortaa", label: "Comfortaa", css: "font-comfortaa" },
    { id: "chewy", label: "Chewy", css: "font-chewy" },
    { id: "freckle", label: "Freckle Face", css: "font-freckle" },
    { id: "changa", label: "Changa One", css: "font-changa" },

    // Script / Handwritten
    { id: "pacifico", label: "Pacifico", css: "font-pacifico" },
    { id: "cherry", label: "Cherry Bomb One", css: "font-cherry" },
    { id: "gloria", label: "Gloria Hallelujah", css: "font-gloria" },
    { id: "permanent", label: "Permanent Marker", css: "font-permanent" },
    { id: "shadows", label: "Shadows Into Light", css: "font-shadows" },
    { id: "patrick", label: "Patrick Hand", css: "font-patrick" },
    { id: "gochi", label: "Gochi Hand", css: "font-gochi" },

    // Loud / Display
    { id: "bungee", label: "Bungee", css: "font-bungee" },
    { id: "luckiest", label: "Luckiest Guy", css: "font-luckiest" },
    { id: "righteous", label: "Righteous", css: "font-righteous" },
    { id: "bowlby", label: "Bowlby One SC", css: "font-bowlby" },
    { id: "russo", label: "Russo One", css: "font-russo" },
    { id: "bebas", label: "Bebas Neue", css: "font-bebas" },
    { id: "titan", label: "Titan One", css: "font-titan" },
    { id: "alfa", label: "Alfa Slab One", css: "font-alfa" },

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
