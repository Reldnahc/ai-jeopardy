// src/components/common/profileIcons.tsx
type IconRendererProps = { title?: string };
type IconKind = "stroke" | "fill";

type IconDef = {
    kind: IconKind;
    Renderer: React.FC<IconRendererProps>;
};

const stroke = (Renderer: React.FC<IconRendererProps>): IconDef => ({ kind: "stroke", Renderer });
const fill = (Renderer: React.FC<IconRendererProps>): IconDef => ({ kind: "fill", Renderer });

const ICONS = {
    // FILL icons
    star: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9 6.8 19l1-5.8-4.2-4.1 5.8-.8L12 3z" />
        </>
    )),

    star2: fill(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9 6.8 19l1-5.8-4.2-4.1 5.8-.8L12 3z" />
        </>
    )),

    bolt: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M13 3L6 13h5l-1 8 8-11h-5l1-7z" />
        </>
    )),

    bolt2: fill(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M13 3L6 13h5l-1 8 8-11h-5l1-7z" />
        </>
    )),

    // STROKE icons
    crown: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M4 8l4 4 4-7 4 7 4-4" />
            <path d="M4 8l2 12h12l2-12" />
            <path d="M8 20h8" />
        </>
    )),

    skull: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3c-4.5 0-8 3.4-8 7.5 0 2.6 1.6 4.9 4 6.2V19c0 .6.4 1 1 1h6c.6 0 1-.4 1-1v-2.3c2.4-1.3 4-3.6 4-6.2 0-4.1-3.5-7.5-8-7.5z" />
            <circle cx="9" cy="11" r="1.3" />
            <circle cx="15" cy="11" r="1.3" />
            <path d="M12 14l-1.2 2h2.4L12 14z" />
        </>
    )),

    rocket: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 2c2.6 1.5 4.6 3.5 6.1 6.1L12 22 5.9 8.1C7.4 5.5 9.4 3.5 12 2z" />
            <circle cx="12" cy="9.2" r="1.4" />
            <path d="M6.6 12.6L4.2 16.8l3.9-1.2z" />
            <path d="M17.4 12.6l2.4 4.2-3.9-1.2z" />
            <path d="M12 22c-1.5-1.6-2-3-1.5-4 1 .5 1.5 1.2 1.5 2 0-.8.5-1.5 1.5-2 .5 1-.1 2.4-1.5 4z" />
        </>
    )),

    trophy: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M8 3.5h8v5a4 4 0 0 1-8 0v-5z" />
            <path d="M8 5.5H5.2A2.8 2.8 0 0 0 8 10" />
            <path d="M16 5.5h2.8A2.8 2.8 0 0 1 16 10" />
            <path d="M12 13v6" />
            <path d="M9 19h6" />
        </>
    )),

    medal: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M8.5 3l3.5 6 3.5-6" />
            <circle cx="12" cy="15.5" r="6" />
            <path d="M12 13.5v4" />
        </>
    )),

    sparkles: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5L12 3z" />
            <path d="M5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8L5 14z" />
            <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8L19 14z" />
        </>
    )),

    sparkles2: fill(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5L12 3z" />
            <path d="M5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8L5 14z" />
            <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8L19 14z" />
        </>
    )),

    lock: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <rect x="6" y="11" width="12" height="9" rx="2" />
            <path d="M9 11V7a3 3 0 0 1 6 0v4" />
            <circle cx="12" cy="15" r="1" />
            <path d="M12 16v2" />
        </>
    )),

    dollarsign: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 2v20" />
            <path d="M16 7a4 4 0 0 0-4-2 4 4 0 0 0 0 8 4 4 0 0 1 0 8 4 4 0 0 1-4-2" />
        </>
    )),

    lightbulb: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3a7 7 0 0 0-4.2 12.6c.6.5 1.2 1.4 1.4 2.4h5.6c.2-1 .8-1.9 1.4-2.4A7 7 0 0 0 12 3z" />
            <path d="M10 18h4" />
            <path d="M9.5 20h5" />
            <path d="M10.5 22h3" />
        </>
    )),

    shield: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3l7 3v6c0 5-3 7-7 9-4-2-7-4-7-9V6l7-3z" />
        </>
    )),

    sword: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M12 3l3 3v7l-3 2-3-2V6l3-3z" />
            <path d="M7 14h10" />
            <path d="M12 14v5" />
            <circle cx="12" cy="20" r="1.2" />
        </>
    )),

    target: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1" />
        </>
    )),

    gem: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M7 3h10l4 5-9 13L3 8l4-5z" />
            <path d="M7 3l5 5 5-5" />
            <path d="M3 8h18" />
            <path d="M12 8v13" />
        </>
    )),

    sun: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <circle cx="12" cy="12" r="4" />
            <path d="M19 12h2M3 12h2M12 3v2M12 19v2M17 17l1.5 1.5M5.5 5.5L7 7M17 7l1.5-1.5M5.5 18.5L7 17" />
        </>
    )),

    moon: stroke(({ title }) => (
        <>
            {title ? <title>{title}</title> : null}
            <path d="M20 15.5A8.5 8.5 0 1 1 10.5 3.2A6.5 6.5 0 1 0 20 15.5Z" />
        </>
    )),
} as const;

export type BuiltinProfileIconName = keyof typeof ICONS;
export type ProfileIconName = "letter" | BuiltinProfileIconName;

export const PROFILE_ICON_OPTIONS: ProfileIconName[] = [
    "letter",
    ...(Object.keys(ICONS) as BuiltinProfileIconName[]),
];

export function getIconDef(name: BuiltinProfileIconName) {
    return ICONS[name];
}
