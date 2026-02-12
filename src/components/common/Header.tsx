import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LoginForm from "./LoginForm.tsx";
import Avatar from "./Avatar.tsx";
import { motion, AnimatePresence } from "framer-motion";
import { useAlert } from "../../contexts/AlertContext.tsx";
import { useAuth } from "../../contexts/AuthContext.tsx";

const Header: React.FC = () => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const { user, logout } = useAuth();

    const dropdownRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const hamburgerButton = useRef<HTMLButtonElement>(null);

    const location = useLocation();
    const navigate = useNavigate();
    const { showAlert } = useAlert();

    const toggleDropdown = () => setDropdownOpen((v) => !v);

    const handleLogout = () => {
        const prevent = location.pathname.includes("/game/") || location.pathname.includes("/lobby/");
        if (prevent) {
            showAlert(
                <span>
          <span className="text-red-500 font-bold text-xl">
            You cannot log out in a game or lobby.
          </span>
          <br />
        </span>,
                [
                    {
                        label: "Okay",
                        actionValue: "stay",
                        styleClass: "bg-green-500 text-white hover:bg-green-600",
                    },
                ]
            );
            return;
        }

        // Clear JWT + user in AuthContext
        logout();

        // Close menus so UI doesn't feel stuck
        setDropdownOpen(false);
        setMenuOpen(false);
    };

    const handleNavigate = (to: string) => {
        navigate(to);
    };

    // Close dropdown or mobile menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
            if (
                menuRef.current &&
                hamburgerButton.current &&
                !menuRef.current.contains(event.target as Node) &&
                !hamburgerButton.current.contains(event.target as Node)
            ) {
                setMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Prefer displayname, fallback to username
    const displayName = user?.displayname || user?.username || "";

    // Colors now live on the user (profiles table)
    const avatarColor = user?.color || "#3b82f6";
    const avatarTextColor = user?.text_color || "#ffffff";

    return (
        <header className="bg-gradient-to-r from-indigo-400 to-blue-700 text-white w-full h-[5.5rem] shadow-md">
            <div className="container mx-auto flex items-center py-4 px-6 justify-between h-full">
                {/* Left: Logo */}
                <div className="flex items-center space-x-6">
                    <Link
                        to="/"
                        className="text-4xl md:text-5xl text-shadow-jeopardy font-swiss911 tracking-wider font-bold hover:underline text-white hover:text-blue-600"
                    >
                        AI-Jeopardy.com
                    </Link>

                    <nav className="hidden md:flex items-center space-x-3">
                        <Link to="/recent-boards" className="px-4 text-xl py-2 hover:underline rounded">
                            Recent Boards
                        </Link>
                    </nav>
                </div>

                {/* Right: Login/Profile + Hamburger */}
                <div className="flex items-center space-x-4 h-full">
                    {user ? (
                        <div className="hidden relative md:block" ref={dropdownRef}>
                            <button
                                onClick={toggleDropdown}
                                className="flex items-center text-xl px-4 py-2 rounded hover:bg-blue-400 focus:outline-none"
                            >
                                <Avatar name={displayName} size="10" color={avatarColor} textColor={avatarTextColor} />
                                <span className="ml-3">{displayName}</span>

                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4 ml-2"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            <AnimatePresence>
                                {dropdownOpen && (
                                    <motion.div
                                        className="absolute right-0 mt-2 w-48 bg-gray-100 text-black rounded shadow-lg z-50"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <Link
                                            to={`/profile/${user.username}`}
                                            onClick={() => setDropdownOpen(false)}
                                            className="block px-4 py-2 text-blue-600 hover:bg-gray-200"
                                        >
                                            Profile
                                        </Link>

                                        <Link
                                            to={`/profile/${user.username}/history`}
                                            onClick={() => setDropdownOpen(false)}
                                            className="block px-4 py-2 text-blue-600 hover:bg-gray-200 text-left w-full"
                                        >
                                            History
                                        </Link>

                                        <span
                                            onClick={handleLogout}
                                            className="block px-4 py-2 text-red-600 hover:bg-gray-200 cursor-pointer"
                                        >
                      Log out
                    </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <LoginForm />
                    )}

                    {/* Hamburger (mobile) */}
                    <button
                        className="md:hidden flex items-center px-3 py-2 rounded text-white hover:bg-blue-500 focus:outline-none"
                        onClick={() => setMenuOpen((v) => !v)}
                        ref={hamburgerButton}
                    >
                        {user && (
                            <div className="mr-2">
                                <Avatar name={displayName} size="10" color={avatarColor} textColor={avatarTextColor} />
                            </div>
                        )}
                        <svg
                            className="h-6 w-6"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile dropdown */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        className="absolute top-[5.5rem] inset-x-0 bg-gray-100 text-black rounded shadow-lg z-50"
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        variants={{ hidden: { height: 0, opacity: 0 }, visible: { height: "auto", opacity: 1 } }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        ref={menuRef}
                    >
                        <motion.div
                            className="flex flex-col"
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            variants={{
                                hidden: { opacity: 0, transition: { staggerChildren: 0.1, staggerDirection: -1 } },
                                visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
                            }}
                        >
                            <motion.button
                                className="block px-4 py-2 hover:bg-blue-500 cursor-pointer"
                                onClick={() => {
                                    handleNavigate("/recent-boards");
                                    setMenuOpen(false);
                                }}
                                variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } }}
                            >
                                Recent Boards
                            </motion.button>

                            {user && (
                                <>
                                    <motion.button
                                        className="block px-4 py-2 hover:bg-blue-500 cursor-pointer"
                                        variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } }}
                                        onClick={() => {
                                            handleNavigate(`/profile/${user.username}`);
                                            setMenuOpen(false);
                                        }}
                                    >
                                        Profile
                                    </motion.button>

                                    <motion.button
                                        className="block px-4 py-2 hover:bg-blue-500 cursor-pointer"
                                        variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } }}
                                        onClick={() => {
                                            handleNavigate(`/profile/${user.username}/history`);
                                            setMenuOpen(false);
                                        }}
                                    >
                                        History
                                    </motion.button>

                                    <motion.button
                                        className="block px-4 py-2 text-red-600 hover:bg-blue-500 cursor-pointer"
                                        variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } }}
                                        onClick={() => {
                                            handleLogout();
                                            setMenuOpen(false);
                                        }}
                                    >
                                        Log out
                                    </motion.button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};

export default Header;
