export type ProfileIconName =
    | "letter"
    | "star"
    | "bolt"
    | "crown"
    | "skull"
    | "rocket"
    | "brain"
    | "trophy"
    | "sparkles"
    | "lock";

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
    const common = {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        className,
        style,
        "aria-hidden": title ? undefined : true,
        role: title ? "img" : "presentation",
    } as const;

    switch (name) {
        case "star":
            return (
                <svg {...common} fill="currentColor">
                    {title ? <title>{title}</title> : null}
                    <path d="M12 2.6l2.9 5.88 6.5.94-4.7 4.58 1.1 6.48L12 17.9 6.2 20.48l1.1-6.48L2.6 9.42l6.5-.94L12 2.6z" />
                </svg>
            );

        case "bolt":
            return (
                <svg {...common} fill="currentColor">
                    {title ? <title>{title}</title> : null}
                    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
            );

        case "crown":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <path d="M4 8l4 4 4-7 4 7 4-4" />
                    <path d="M4 8l2 12h12l2-12" />
                    <path d="M8 20h8" />
                </svg>
            );

        case "skull":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <path d="M12 3c-4.4 0-8 3.1-8 7 0 2.6 1.6 4.9 4 6v3h8v-3c2.4-1.1 4-3.4 4-6 0-3.9-3.6-7-8-7z" />
                    <path d="M9 12h.01M15 12h.01" />
                    <path d="M10 16h4" />
                </svg>
            );

        case "rocket":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <path d="M12 2c4 1 7 4 8 8-2 3-5 6-8 8-3-1-6-4-8-8 1-4 4-7 8-8z" />
                    <path d="M9 15l-2 5 5-2" />
                    <path d="M14 9h.01" />
                </svg>
            );

        case "brain":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <path d="M9 4a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3" />
                    <path d="M15 4a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3" />
                    <path d="M9 4c1 0 2 .5 2 1.5V18" />
                    <path d="M15 4c-1 0-2 .5-2 1.5V18" />
                </svg>
            );

        case "trophy":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
                    <path d="M6 6H4a2 2 0 0 0 2 2" />
                    <path d="M18 6h2a2 2 0 0 1-2 2" />
                    <path d="M12 11v4" />
                    <path d="M9 19h6" />
                    <path d="M10 15h4" />
                </svg>
            );

        case "sparkles":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <path d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 12l-1.2-3.4L7 7.4l3.8-1.2L12 2z" />
                    <path d="M5 13l.8 2.8L9 16.6l-3.2.8L5 20l-.8-2.6L1 16.6l3.2-.8L5 13z" />
                    <path d="M19 13l.7 2.3L22 16l-2.3.7L19 19l-.7-2.3L16 16l2.3-.7L19 13z" />
                </svg>
            );

        case "lock":
            return (
                <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {title ? <title>{title}</title> : null}
                    <rect x="6" y="11" width="12" height="9" rx="2" />
                    <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                    <circle cx="12" cy="15" r="1" />
                    <path d="M12 16v2" />
                </svg>
            );

        // "letter" is handled by Avatar (so it can render the actual initial)
        case "letter":
        default:
            return null;
    }
}
