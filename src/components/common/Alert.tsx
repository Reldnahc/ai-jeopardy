import React, { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface AlertButton {
  label: string; // The text to display on the button
  onClick: () => void; // The callback when the button is clicked
  styleClass?: string; // Optional custom styles for the button
  disabled?: boolean; // For disable-able functionality
}

interface AlertProps {
  isOpen: boolean; // Whether the alert is visible or not
  header: ReactNode; // Header content
  text: ReactNode; // The message to display
  buttons: AlertButton[]; // Array of buttons, fully dynamic
  closeAlert: () => void; // Function to close the alert
}

const Alert: React.FC<AlertProps> = ({ isOpen, header, text, buttons, closeAlert }) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-lg rounded-lg border border-white/20 bg-gradient-to-b from-[#1a3f80] via-[#2456a8] to-[#1b468f] text-white shadow-[0_24px_64px_rgba(0,0,0,0.55)] overflow-hidden"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="px-6 pt-5 pb-4 border-b border-white/15 bg-black/20">
              <h2 className="text-4xl leading-none font-swiss911 tracking-wider text-shadow-jeopardy text-yellow-300">
                {header}
              </h2>
            </div>

            <div className="px-6 py-6">
              <div className="text-base md:text-lg text-white/95 leading-relaxed">{text}</div>
            </div>

            <div className="px-6 pb-6 flex flex-wrap justify-end gap-3">
              {buttons.map((button, index) => (
                <button
                  key={index}
                  disabled={Boolean(button.disabled)}
                  className={[
                    "px-5 py-2.5 rounded-md border border-white/15 focus:outline-none transition font-semibold shadow-md",
                    button.styleClass ||
                      "bg-gradient-to-b from-yellow-400 to-yellow-500 text-slate-900 hover:from-yellow-300 hover:to-yellow-400",
                    button.disabled ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                  onClick={() => {
                    if (button.disabled) return;
                    button.onClick();
                    closeAlert();
                  }}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default Alert;
