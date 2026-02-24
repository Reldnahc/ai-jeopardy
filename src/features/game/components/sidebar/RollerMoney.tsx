import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

function formatWithCommas(n: number) {
  return Math.trunc(n).toLocaleString();
}

function DigitRoll({ digit }: { digit: number }) {
  const safeDigit = Number.isFinite(digit) ? Math.max(0, Math.min(9, digit)) : 0;

  const transition = useMemo(
    () => ({
      type: "spring" as const,
      stiffness: 260,
      damping: 26,
      mass: 0.7,
    }),
    [],
  );

  return (
    <span
      className="relative inline-block overflow-hidden w-[0.72em] h-[1em] align-baseline"
      style={{ lineHeight: "1em" }}
    >
      <motion.div
        className="absolute left-0 top-0"
        animate={{ y: `-${safeDigit}em` }}
        transition={transition}
        style={{ lineHeight: "1em" }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-[1em] leading-[1em]" style={{ lineHeight: "1em" }}>
            {i}
          </div>
        ))}
      </motion.div>
    </span>
  );
}

interface RollerMoneyProps {
  value: number;
  className?: string;
}

const RollerMoney: React.FC<RollerMoneyProps> = ({ value, className }) => {
  const prevRef = useRef<number>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;

    setFlash(value > prev ? "up" : "down");
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => setFlash(null), 450);

    prevRef.current = value;
  }, [value]);

  const isNeg = value < 0;
  const absStr = useMemo(() => formatWithCommas(Math.abs(value)), [value]);

  const flashClass =
    flash === "up"
      ? "ring-2 ring-green-400/70 bg-green-500/10"
      : flash === "down"
        ? "ring-2 ring-red-400/70 bg-red-500/10"
        : "";

  return (
    <span
      className={[
        "inline-flex items-center rounded-lg px-2 py-1 transition",
        "tabular-nums select-none",
        flashClass,
        className ?? "",
      ].join(" ")}
    >
      <span className="mr-0.5">$</span>
      {isNeg && <span className="mr-0.5">-</span>}

      <span className="inline-flex items-center">
        {absStr.split("").map((ch, idx) => {
          if (ch === ",")
            return (
              <span key={`c-${idx}`} className="mx-[1px]">
                ,
              </span>
            );

          const digit = ch.charCodeAt(0) - 48;
          return <DigitRoll key={`d-${idx}`} digit={digit} />;
        })}
      </span>
    </span>
  );
};

export default RollerMoney;
