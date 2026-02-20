// BuzzAnimation.tsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BuzzAnimationProps {
  playerName: string | null;
}

const GLOW_STYLE: React.CSSProperties = {
  color: "#FFF",
  textShadow: `
    -2px -2px 0 #000,
    2px -2px 0 #000,
    -2px 2px 0 #000,
    2px 2px 0 #000,
    0 0 20px rgba(255, 223, 0, 0.8),
    0 0 30px rgba(255, 223, 0, 0.6),
    0 0 40px rgba(255, 223, 0, 0.4)
  `,
};

const BuzzAnimation: React.FC<BuzzAnimationProps> = ({ playerName }) => {
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    if (!playerName) return;
    setShowAnimation(true);
    const t = window.setTimeout(() => setShowAnimation(false), 900); // slightly shorter feels snappier
    return () => window.clearTimeout(t);
  }, [playerName]);

  return (
    <AnimatePresence>
      {showAnimation && playerName && (
        <motion.div
          initial={{ opacity: 0, y: 0, scale: 0.85 }}
          animate={{ opacity: 1, y: -80, scale: 1.15 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 text-center pointer-events-none"
          style={{
            willChange: "transform, opacity",
            transform: "translate3d(-50%, -50%, 0)", // Safari likes explicit 3d
            backfaceVisibility: "hidden",
          }}
        >
          {/* Text is NOT animated; wrapper is */}
          <div className="text-6xl font-extrabold" style={GLOW_STYLE}>
            {playerName}
            <div className="text-red-500 text-4xl mt-2">BUZZED!</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BuzzAnimation;
