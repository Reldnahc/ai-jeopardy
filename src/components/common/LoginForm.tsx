import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AuthForm from "./AuthForm.tsx";

const LoginForm = () => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    const toggleMenu = () => {
        setOpen(!open);
    };

    // Switch animation (no sliding). Size changes are handled by layout.
    const switchVariants = {
        initial: { opacity: 0, scale: 0.98 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.98 },
    };

    return (
        <div className="relative" ref={menuRef}>
            {/* Toggle Button */}
            <button
                onClick={toggleMenu}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none transition-colors duration-200 shadow-md"
            >
                Login / Signup
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        className="absolute right-0 mt-2 w-80 bg-white p-6 rounded-lg shadow-xl z-10 overflow-hidden"
                        layout="size"
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{
                            duration: 0.2,
                            ease: "easeOut",
                            layout: { duration: 0.25, ease: "easeInOut" }
                        }}

                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key="signup"
                                variants={switchVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.15 }}
                                layout
                            >
                                <AuthForm />
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LoginForm;
