// src/components/common/ProfileIcon.tsx
import * as React from "react";
import { getIconRenderer, type ProfileIconName } from "./profileIcons";

type Props = {
    name: ProfileIconName;
    className?: string;
    title?: string;
    style?: React.CSSProperties;
};

/**
 * Uses `currentColor` for stroke/fill.
 * Control color via `className="text-..."` or inline `style={{ color: "#fff" }}` on the parent.
 */
export default function ProfileIcon({ name, className = "", title, style }: Props) {
    if (name === "letter") return null;

    const common = {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        className,
        style,
        "aria-hidden": title ? undefined : true,
        role: title ? "img" : "presentation",
    } as const;

    const Renderer = getIconRenderer(name);

    // stroke vs fill per-icon: simplest is a small set check
    const strokeIcons = new Set(["crown", "skull", "rocket", "brain", "trophy", "sparkles", "lock"] as const);
    const isStroke = strokeIcons.has(name as any);

    if (isStroke) {
        return (
            <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <Renderer title={title} />
            </svg>
        );
    }

    return (
        <svg {...common} fill="currentColor">
            <Renderer title={title} />
        </svg>
    );
}
