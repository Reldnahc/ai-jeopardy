import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";

interface TimerProps {
  endTime: number | null;
  duration: number;
}

const Timer: React.FC<TimerProps> = ({ endTime, duration }) => {
  const [timeLeft, setTimeLeft] = useState<number>(duration);
  const { nowMs } = useWebSocket();

  const isLastSeconds = timeLeft <= 3;
  const displayTime = Math.ceil(timeLeft);

  useEffect(() => {
    if (!endTime) {
      setTimeLeft(duration);
      return;
    }

    const intervalId = setInterval(() => {
      const remaining = Math.max(0, (endTime - nowMs()) / 1000);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(intervalId);
      }
    }, 16); // 60fps update rate

    return () => clearInterval(intervalId);
  }, [endTime, duration, nowMs]);

  return (
    <div className="timer flex justify-center items-center min-h-[200px]">
      <AnimatePresence mode="wait">
        {timeLeft > 0 && (
          <motion.div
            key={displayTime}
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: "easeOut",
            }}
            className="relative"
          >
            <motion.div
              animate={{
                scale: isLastSeconds ? [1, 1.08, 1] : [1, 1.02, 1],
              }}
              transition={{
                duration: isLastSeconds ? 0.4 : 2,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.5, 1],
              }}
              className={`
                                text-8xl font-black
                                ${isLastSeconds ? "text-red-500" : "text-yellow-500"}
                                transition-colors duration-500
                            `}
              style={{
                textShadow: `
                                    -2px -2px 0 #000,  
                                    2px -2px 0 #000,
                                    -2px 2px 0 #000,
                                    2px 2px 0 #000,
                                    0 0 ${isLastSeconds ? "20px" : "10px"} rgba(0,0,0,0.5)
                                `,
                filter: `drop-shadow(0 0 ${isLastSeconds ? "10px" : "5px"} rgba(255,255,255,0.3))`,
              }}
            >
              {displayTime}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Timer;
