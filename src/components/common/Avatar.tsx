import React from "react";

interface AvatarProps {
    name: string; // Player name
    size?: string; // CSS size for the avatar (optional, default is "8")
    color?: string | null; // Background color for the avatar (default: "bg-blue-500")
    textColor?: string | null; // Text color for the avatar (default: "text-white")
}

const Avatar: React.FC<AvatarProps> = ({
                                           name,
                                           size = "8",
                                           color = "bg-blue-500",
                                           textColor = "text-white",
                                       }) => {
    const avatarSize = `${parseInt(size) * 4}px`; // Convert size into pixel values (e.g., "8" -> "32px")

    return (
        <div
            className={`rounded-full ${color} ${textColor} flex justify-center items-center font-bold border border-black border-opacity-10`}
            style={{
                width: avatarSize,
                height: avatarSize,
                fontSize: `${parseInt(size) * 2}px`, // Dynamically scale font size

            }}
        >
            <span className="relative top-[-1px]">
              {name?.charAt(0).toUpperCase()}
            </span>

        </div>
    );
};

export default Avatar;