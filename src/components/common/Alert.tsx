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
  text: ReactNode; // The message to display
  buttons: AlertButton[]; // Array of buttons, fully dynamic
  closeAlert: () => void; // Function to close the alert
}

const Alert: React.FC<AlertProps> = ({ isOpen, text, buttons, closeAlert }) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-lg mb-6 text-gray-800">{text}</p>
            <div className="flex justify-end space-x-3">
              {buttons.map((button, index) => (
                <button
                  key={index}
                  disabled={Boolean(button.disabled)}
                  className={[
                    "px-5 py-2 rounded-md focus:outline-none transition",
                    button.styleClass || "bg-blue-600 text-white hover:bg-blue-700",
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
