import React from "react";

interface AvatarProps {
    name: string;
    size?: string;
    color?: string | null;     // can be tailwind class OR hex
    textColor?: string | null; // can be tailwind class OR hex
}

function isHexColor(s: unknown): s is string {
    return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

const Avatar: React.FC<AvatarProps> = ({
                                           name,
                                           size = "8",
                                           color = "bg-blue-500",
                                           textColor = "text-white",
                                       }) => {
    const avatarSize = `${parseInt(size) * 4}px`;

    const bgClass = isHexColor(color) ? "" : (color ?? "");
    const textClass = isHexColor(textColor) ? "" : (textColor ?? "");

    const style: React.CSSProperties = {
        width: avatarSize,
        height: avatarSize,
        fontSize: `${parseInt(size) * 2}px`,
        ...(isHexColor(color) ? { backgroundColor: color } : null),
        ...(isHexColor(textColor) ? { color: textColor } : null),
    };

    return (
        <div
            className={`rounded-full ${bgClass} ${textClass} flex justify-center items-center font-bold border border-black border-opacity-10`}
            style={style}
        >
            <span className="relative top-[-1px]">{name?.charAt(0).toUpperCase()}</span>
        </div>
    );
};

export default Avatar;
