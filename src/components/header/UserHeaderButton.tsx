// UserHeaderButton.tsx
import React from "react";
import Avatar from "../common/Avatar";
import { ProfilePresentation } from "../../utils/profilePresentation";
import OutlinedChevron from "../../icons/OutlinedChevron.tsx";

interface Props {
  pres: ProfilePresentation;
  dropdownOpen: boolean;
  setDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  compact?: boolean;
}

export default function UserHeaderButton({ pres, dropdownOpen, setDropdownOpen, compact }: Props) {
  const nameColor = (pres.nameStyle?.color as string | undefined) ?? "#ffffff";

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setDropdownOpen((v) => !v)}
        className={[
          "relative flex items-center rounded-xl",
          "text-white transition-all duration-200",
          "focus:outline-none hover:brightness-110",
          compact ? "px-3 py-2" : "text-xl px-4 py-2",
        ].join(" ")}
        style={{
          backgroundColor: pres.backgroundColor ?? "#1e293b",
          ...(pres.borderStyle ?? {}),
        }}
      >
        <Avatar
          name={pres.avatar.nameForLetter}
          size="10"
          color={pres.avatar.bgColor}
          textColor={pres.avatar.fgColor}
          icon={pres.avatar.icon}
        />

        <span className={`ml-3 ${pres.nameClassName} hidden sm:inline`} style={pres.nameStyle}>
          {pres.displayName}
        </span>

        {/* If compact and you want a little spacing from avatar, keep ml-2; otherwise your chevron can include its own */}
        <OutlinedChevron
          color={nameColor}
          rotated={dropdownOpen}
          className={compact ? "ml-2" : ""}
        />
      </button>
    </div>
  );
}
