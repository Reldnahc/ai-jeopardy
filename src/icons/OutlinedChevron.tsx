function getContrastOutline(hex: string | undefined): string {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return "black";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "black" : "white";
}

export default function OutlinedChevron({
  color,
  rotated,
  className = "",
}: {
  color?: string;
  rotated?: boolean;
  className?: string;
}) {
  const nameColor = color ?? "#ffffff";
  const outlineColor = getContrastOutline(nameColor);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 ml-2 transition-transform ${rotated ? "rotate-180" : ""} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M19 9l-7 7-7-7"
        stroke={outlineColor}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 9l-7 7-7-7"
        stroke={nameColor}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
