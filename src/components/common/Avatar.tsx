import React from "react";
import ProfileIcon from "./ProfileIcon";
import { ProfileIconName } from "./profileIcons.tsx";

interface AvatarProps {
  name: string;
  size?: string; // same as before (tailwind-ish number)
  color?: string | null; // tailwind bg-* OR hex
  textColor?: string | null; // tailwind text-* OR hex
  icon?: ProfileIconName | null;
  style?: React.CSSProperties;
}

function isHexColor(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

export default function Avatar({
  name,
  size = "8",
  color = "bg-blue-500",
  textColor = "text-white",
  icon = "letter",
}: AvatarProps) {
  const n = Math.max(1, Number.parseInt(size, 10) || 8);

  const avatarSize = `${n * 4}px`;

  const bgClass = isHexColor(color) ? "" : (color ?? "");
  const textClass = isHexColor(textColor) ? "" : (textColor ?? "");

  const style: React.CSSProperties = {
    width: avatarSize,
    height: avatarSize,
    ...(isHexColor(color) ? { backgroundColor: color } : null),
    ...(isHexColor(textColor) ? { color: textColor } : null), // drives `currentColor` in the SVG too
  };

  const showLetter = !icon || icon === "letter";
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  // icon size relative to avatar
  const iconPx = Math.round(n * 3); // tweak if you want

  return (
    <div
      className={[
        "rounded-full flex items-center justify-center font-bold",
        "border border-black border-opacity-10",
        bgClass,
        textClass,
      ].join(" ")}
      style={style}
      aria-label={name}
      title={name}
    >
      {showLetter ? (
        <span
          style={{
            fontSize: `${n * 2}px`,
            lineHeight: avatarSize, // vertically centers glyph in the circle
            width: "100%",
            textAlign: "center", // centers horizontally
            display: "block",
            transform: "translate(-1px, -1px)", // optical nudge (tweak to taste)
          }}
        >
          {initial}
        </span>
      ) : (
        <ProfileIcon
          name={icon}
          className=""
          style={{
            width: `${iconPx}px`,
            height: `${iconPx}px`,
            display: "block",
            flex: "0 0 auto",
          }}
        />
      )}
    </div>
  );
}
