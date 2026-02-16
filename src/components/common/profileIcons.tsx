// src/components/common/profileIcons.tsx
type IconRendererProps = {
    title?: string;
};

const ICONS = {
    star: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 2.6l2.9 5.88 6.5.94-4.7 4.58 1.1 6.48L12 17.9 6.2 20.48l1.1-6.48L2.6 9.42l6.5-.94L12 2.6z" />
        </>
    ),

    bolt: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </>
    ),

    crown: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M4 8l4 4 4-7 4 7 4-4" />
            <path d="M4 8l2 12h12l2-12" />
            <path d="M8 20h8" />
        </>
    ),

    skull: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            {/* cranium */}
            <path d="M12 3c-4.7 0-8.5 3.5-8.5 7.8 0 2.9 1.8 5.5 4.6 6.9V20c0 .6.4 1 1 1h6.8c.6 0 1-.4 1-1v-2.3c2.8-1.4 4.6-4 4.6-6.9C20.5 6.5 16.7 3 12 3z" />
            {/* eyes */}
            <circle cx="9.5" cy="11.5" r="1.2" />
            <circle cx="14.5" cy="11.5" r="1.2" />
            {/* teeth */}
            <path d="M10 16h4" />
            <path d="M11 16v2" />
            <path d="M13 16v2" />
        </>
    ),


    rocket: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            {/* body */}
            <path d="M12 2.5c3.9 1.1 6.9 4.1 8 8-2 3.2-4.8 6-8 8-3.2-2-6-4.8-8-8 1.1-3.9 4.1-6.9 8-8z" />
            {/* window */}
            <circle cx="12" cy="9.5" r="1.3" />
            {/* fins */}
            <path d="M8.2 14.8 6 19l4.2-2.2" />
            <path d="M15.8 14.8 18 19l-4.2-2.2" />
            {/* flame */}
            <path d="M12 18.3c-.8 1-1.2 2.1-1.2 3.2 1.1-.3 1.9-.9 2.4-1.7.5.8 1.3 1.4 2.4 1.7 0-1.1-.4-2.2-1.2-3.2" />
        </>
    ),


    brain: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M9 4a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3" />
            <path d="M15 4a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3" />
            <path d="M9 4c1 0 2 .5 2 1.5V18" />
            <path d="M15 4c-1 0-2 .5-2 1.5V18" />
        </>
    ),

    trophy: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
            <path d="M6 6H4a2 2 0 0 0 2 2" />
            <path d="M18 6h2a2 2 0 0 1-2 2" />
            <path d="M12 11v4" />
            <path d="M9 19h6" />
            <path d="M10 15h4" />
        </>
    ),

    sparkles: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 12l-1.2-3.4L7 7.4l3.8-1.2L12 2z" />
            <path d="M5 13l.8 2.8L9 16.6l-3.2.8L5 20l-.8-2.6L1 16.6l3.2-.8L5 13z" />
            <path d="M19 13l.7 2.3L22 16l-2.3.7L19 19l-.7-2.3L16 16l2.3-.7L19 13z" />
        </>
    ),

    lock: ({ title }: IconRendererProps) => (
        <>
            {title ? <title>{title}</title> : null}
            <rect x="6" y="11" width="12" height="9" rx="2" />
            <path d="M9 11V7a3 3 0 0 1 6 0v4" />
            <circle cx="12" cy="15" r="1" />
            <path d="M12 16v2" />
        </>
    ),
} as const;

export type BuiltinProfileIconName = keyof typeof ICONS;

// include "letter" here so your app type is still the full set
export type ProfileIconName = "letter" | BuiltinProfileIconName;

// this becomes your picker list (plus letter)
export const PROFILE_ICON_OPTIONS: ProfileIconName[] = [
    "letter",
    ...(Object.keys(ICONS) as BuiltinProfileIconName[]),
];

// small helper used by ProfileIcon component
export function getIconRenderer(name: BuiltinProfileIconName) {
    return ICONS[name];
}
