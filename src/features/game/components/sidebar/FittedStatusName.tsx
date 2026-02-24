import React, { useEffect, useRef } from "react";

function useAutoShrinkText<T extends HTMLElement>(
  text: string,
  minFontSize: number = 11,
  step: number = 1,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.fontSize = "";

    const computed = window.getComputedStyle(el);
    let currentSize = parseFloat(computed.fontSize);

    while (currentSize > minFontSize && el.scrollWidth > el.clientWidth) {
      currentSize -= step;
      el.style.fontSize = `${currentSize}px`;
    }
  }, [text, minFontSize, step]);

  return ref;
}

interface FittedStatusNameProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

const FittedStatusName: React.FC<FittedStatusNameProps> = ({ text, className, style }) => {
  const ref = useAutoShrinkText<HTMLSpanElement>(text);
  return (
    <span
      ref={ref}
      className={["hidden lg:inline text-base truncate leading-none", className ?? ""].join(" ")}
      style={{
        whiteSpace: "nowrap",
        ...style,
      }}
      title={text}
    >
      {text}
    </span>
  );
};

export default FittedStatusName;
