import { useLayoutEffect, useMemo, useRef, useState } from "react";

type SvgOutlinedTextProps = {
    text: string;
    className?: string;

    fontFamily?: string;
    fontWeight?: number;

    fill?: string;
    stroke?: string;

    /** If provided, acts as a baseline, but will still auto-scale */
    strokeWidth?: number;

    letterSpacingEm?: number;
    uppercase?: boolean;

    singleLine?: boolean;
    maxLines?: number;
    wrapAtChars?: number;

    /** Padding inside the container (px) */
    paddingPx?: number;

    /** How tall text block can be vs container height (0..1) */
    heightFill?: number;

    /** Line height multiplier */
    lineHeight?: number;

    /** Shadow: 0 = off, 1 = on */
    shadow?: boolean;

    smallPrefix?: string;       // e.g. "$"
    smallPrefixScale?: number;  // e.g. 0.7
};

function splitToLines(text: string, wrapAtChars: number, maxLines: number) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let cur = "";

    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length <= wrapAtChars || cur.length === 0) {
            cur = next;
        } else {
            lines.push(cur);
            cur = w;
            if (lines.length >= maxLines - 1) break;
        }
    }
    if (cur) lines.push(cur);

    // truncate with ellipsis if needed
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
        lines[maxLines - 1] = lines[maxLines - 1].replace(/\.*$/, "") + "…";
    }

    return lines.slice(0, maxLines);
}

export default function SvgOutlinedText({
                                            text,
                                            className = "",
                                            fontFamily = '"swiss911","Impact","Haettenschweiler","Arial Black","Franklin Gothic Medium",system-ui,sans-serif',
                                            fontWeight = 900,
                                            fill = "#FBBF24",
                                            stroke = "rgba(0,0,0,0.85)",
                                            strokeWidth,
                                            letterSpacingEm = 0.25,
                                            uppercase = true,
                                            singleLine = false,
                                            maxLines = 3,
                                            wrapAtChars = 12,
                                            paddingPx = 10,
                                            heightFill = 0.86,
                                            lineHeight = 0.92,
                                            shadow = true,
                                        }: SvgOutlinedTextProps) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const textRefs = useRef<Array<SVGTextElement | null>>([]);

    const [box, setBox] = useState({ w: 0, h: 0 });
    const [layout, setLayout] = useState({
        fontSize: 40,
        strokePx: 3,
        lineGap: 40,
    });

    const displayText = uppercase ? (text ?? "").toUpperCase() : (text ?? "");

    const lines = useMemo(() => {
        if (singleLine) return [displayText];
        return splitToLines(displayText, wrapAtChars, maxLines);
    }, [displayText, singleLine, wrapAtChars, maxLines]);

    // Keep refs array length in sync
    textRefs.current = lines.map((_, i) => textRefs.current[i] ?? null);

    // Observe container size
    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            const cr = entries[0]?.contentRect;
            if (!cr) return;
            setBox({ w: Math.max(0, cr.width), h: Math.max(0, cr.height) });
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Fit text to container using actual computed text lengths
    useLayoutEffect(() => {
        const w = box.w;
        const h = box.h;
        if (!w || !h) return;

        const availW = Math.max(1, w - paddingPx * 2);
        const availH = Math.max(1, h - paddingPx * 2);

        const targetBlockH = availH * heightFill;
        const initialFont = Math.max(8, targetBlockH / (lines.length + 0.15));

        const raf = requestAnimationFrame(() => {
            const measureAndFit = () => {
                const els = textRefs.current;
                if (els.length === 0) return;

                const currentFont = layout.fontSize || initialFont;

                // widest line in px
                let maxLen = 1;
                for (const t of els) {
                    if (!t) continue;
                    const len = t.getComputedTextLength();
                    if (Number.isFinite(len)) maxLen = Math.max(maxLen, len);
                }

                // current line gap and total height
                const currentLineGap = (layout.lineGap || currentFont) * lineHeight;
                const totalTextH = (lines.length - 1) * currentLineGap + currentFont;

                // scale factors to fit width + height (SAME FOR ALL CASES)
                const sW = availW / maxLen * 2;
                const sH = targetBlockH / totalTextH;
                const s = Math.min(sW, sH);

                const nextFont = Math.max(8, currentFont * s);
                const nextGap = nextFont * lineHeight;

                const computedStroke =
                    strokeWidth ??
                    Math.min(Math.max(2, nextFont * 0.10), 18);

                const changed =
                    Math.abs(nextFont - layout.fontSize) > 0.5 ||
                    Math.abs(nextGap - layout.lineGap) > 0.5 ||
                    Math.abs(computedStroke - layout.strokePx) > 0.5;

                if (changed) {
                    setLayout({
                        fontSize: nextFont,
                        lineGap: nextGap,
                        strokePx: computedStroke,
                    });
                }
            };

            if (Math.abs(layout.fontSize - initialFont) > initialFont * 0.35) {
                setLayout((prev) => ({
                    ...prev,
                    fontSize: initialFont,
                    lineGap: initialFont * lineHeight,
                    strokePx: prev.strokePx || 3,
                }));
                requestAnimationFrame(measureAndFit);
            } else {
                measureAndFit();
            }
        });

        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [box.w, box.h, lines.join("\n")]);

    const startY = box.h / 2 - ((lines.length - 1) * layout.lineGap) / 2;

    return (
        <div ref={wrapRef} className={className}>
            <svg width="100%" height="100%" role="img" aria-label={displayText}>
                {shadow && (
                    <defs>
                        <filter id="jeopardyShadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="4" dy="4" stdDeviation="0" floodColor="rgba(0,0,0,0.85)" />
                            <feDropShadow dx="10" dy="10" stdDeviation="2.5" floodColor="rgba(0,0,0,0.15)" />
                        </filter>
                    </defs>
                )}

                <g
                    filter={shadow ? "url(#jeopardyShadow)" : undefined}
                    style={{
                        fontFamily,
                        fontWeight,
                        letterSpacing: `${letterSpacingEm}em`,
                    }}
                >
                    {lines.map((line, i) => (
                        <text
                            key={i}
                            ref={(el) => {
                                textRefs.current[i] = el;
                            }}
                            x={box.w / 2}
                            y={startY + i * layout.lineGap}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={layout.strokePx}
                            paintOrder="stroke"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            style={{
                                fontSize: layout.fontSize,
                            }}
                        >
                            {line}
                        </text>
                    ))}
                </g>
            </svg>
        </div>
    );
}
