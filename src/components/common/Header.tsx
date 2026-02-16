import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LoginForm from "./LoginForm.tsx";
import Avatar from "./Avatar.tsx";
import { motion, AnimatePresence } from "framer-motion";
import { useAlert } from "../../contexts/AlertContext.tsx";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import { getProfilePresentation } from "../../utils/profilePresentation.ts";

type NavItem =
    | { key: string; label: string; to: string; kind: "link" }
    | { key: string; label: string; kind: "action"; danger?: boolean; onClick: () => void };

const Header: React.FC = () => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const { user, logout } = useAuth();
    const { profile } = useProfile();

    const dropdownRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const hamburgerButton = useRef<HTMLButtonElement>(null);

    const location = useLocation();
    const navigate = useNavigate();
    const { showAlert } = useAlert();

    const closeAllMenus = () => {
        setDropdownOpen(false);
        setMenuOpen(false);
    };

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

        logout();
        closeAllMenus();
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

    const pres = getProfilePresentation({
        profile,
        fallbackName: user?.displayname || user?.username || "",
        defaultNameColor: "#ffffff",
    });

    // Desktop top nav ONLY
    const topLinks = useMemo<Extract<NavItem, { kind: "link" }>[]>(() => {
        return [
            { key: "recent", label: "Recent Boards", to: "/recent-boards", kind: "link" },
            { key: "leaderboards", label: "Leaderboards", to: "/leaderboards", kind: "link" },
        ];
    }, []);

    // Account menu items (desktop dropdown + mobile hamburger). Only if logged in.
    const accountItems = useMemo<NavItem[]>(() => {
        if (!user) return [];
        const u = user.username;
        return [
            { key: "profile", label: "Profile", to: `/profile/${u}`, kind: "link" },
            { key: "history", label: "History", to: `/profile/${u}/history`, kind: "link" },
            { key: "logout", label: "Log out", kind: "action", danger: true, onClick: handleLogout },
        ];
    }, [user?.username, location.pathname]);

    return (
        <header className="bg-gradient-to-r from-indigo-400 to-blue-700 text-white w-full h-[5.5rem] shadow-md">
            <div className="container mx-auto flex items-center py-4 px-6 justify-between h-full">
                {/* Left: Logo + Desktop nav */}
                <div className="flex items-center space-x-6">
                    <Link
                        to="/"
                        className="text-3xl lg:text-5xl text-shadow-jeopardy font-swiss911 tracking-wider font-bold hover:underline text-white hover:text-blue-600"
                    >
                        AI-Jeopardy.com
                    </Link>

                    <nav className="hidden md:flex items-center space-x-3 mt-2">
                        {topLinks.map((item) => (
                            <Link
                                key={item.key}
                                to={item.to}
                                className="px-4 lg:text-2xl py-2 font-bold hover:underline hover:text-blue-600 rounded"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Right: Login/Profile + Hamburger */}
                <div className="flex items-center space-x-4 h-full">
                    {user ? (
                        <div className="hidden relative md:block" ref={dropdownRef}>
                            <button
                                onClick={() => setDropdownOpen((v) => !v)}
                                className="flex items-center text-xl px-4 py-2 rounded hover:bg-blue-400 focus:outline-none"
                            >
                                <Avatar
                                    name={pres.avatar.nameForLetter}
                                    size="10"
                                    color={pres.avatar.bgColor}
                                    textColor={pres.avatar.fgColor}
                                    icon={pres.avatar.icon}
                                />
                                <span className={`ml-3 ${pres.nameClassName}`} style={pres.nameStyle}>
                                    {pres.displayName}
                                </span>
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
                                        {accountItems.map((item) => {
                                            if (item.kind === "link") {
                                                return (
                                                    <Link
                                                        key={item.key}
                                                        to={item.to}
                                                        onClick={() => setDropdownOpen(false)}
                                                        className="block px-4 py-2 text-blue-600 hover:bg-gray-200"
                                                    >
                                                        {item.label}
                                                    </Link>
                                                );
                                            }
                                            return (
                                                <span
                                                    key={item.key}
                                                    onClick={item.onClick}
                                                    className={`block px-4 py-2 hover:bg-gray-200 cursor-pointer ${
                                                        item.danger ? "text-red-600" : "text-blue-600"
                                                    }`}
                                                >
                                                    {item.label}
                                                </span>
                                            );
                                        })}
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
                                <Avatar
                                    name={pres.avatar.nameForLetter}
                                    size="10"
                                    color={pres.avatar.bgColor}
                                    textColor={pres.avatar.fgColor}
                                    icon={pres.avatar.icon}
                                />
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

            {/* Mobile menu: topLinks + accountItems (if logged in) */}
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
                        <motion.div className="flex flex-col">
                            {[...topLinks, ...(user ? accountItems : [])].map((item) => (
                                <motion.button
                                    key={item.key}
                                    className={`block px-4 py-2 hover:bg-blue-500 cursor-pointer ${
                                        item.kind === "action" && item.danger ? "text-red-600" : ""
                                    }`}
                                    onClick={() => {
                                        if (item.kind === "link") navigate(item.to);
                                        else item.onClick();
                                        setMenuOpen(false);
                                    }}
                                    variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0 } }}
                                >
                                    {item.label}
                                </motion.button>
                            ))}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};

export default Header;
