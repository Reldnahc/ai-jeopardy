import React, { useState, useEffect, useRef } from "react";
import {Link, useLocation, useNavigate} from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import LoginForm from "./LoginForm.tsx";
import { supabase } from "../../supabaseClient";
import Avatar from "./Avatar.tsx";
import { useUserProfile } from "../../contexts/UserProfileContext.tsx";
import { motion, AnimatePresence } from "framer-motion";
import {useAlert} from "../../contexts/AlertContext.tsx";

const Header: React.FC = () => {
    const [dropdownOpen, setDropdownOpen] = useState(false); // Profile dropdown state
    const [menuOpen, setMenuOpen] = useState(false); // Hamburger menu state
    const { user, setUser } = useAuth();
    const { profile } = useProfile();
    const { userProfile } = useUserProfile();
    const dropdownRef = useRef<HTMLDivElement>(null); // Reference to the dropdown menu
    const menuRef = useRef<HTMLDivElement>(null); // Reference to the hamburger menu
    const hamburgerButton = useRef<HTMLButtonElement>(null); // Reference to the hamburger menu
    const location = useLocation();
    const navigate = useNavigate();
    const { showAlert } = useAlert();

    // Toggle the profile dropdown
    const toggleDropdown = () => setDropdownOpen(!dropdownOpen);

    // Handle logout
    const handleLogout = async () => {
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

        try {
            const { error } = await supabase.auth.signOut();

            // Supabase sometimes returns this when you're already logged out.
            if (error && !error.message?.toLowerCase().includes("auth session missing")) {
                console.error("Error logging out:", error.message);
                return;
            }

            console.log("Logged out successfully (or already logged out).");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);

            if (!msg.toLowerCase().includes("auth session missing")) {
                console.error("Error logging out:", err);
                return;
            }

            // Treat as already logged out
            console.log("No auth session (already logged out).");
        } finally {
            // Always close menus so UI doesn't feel stuck
            setUser(null);
            setDropdownOpen(false);
            setMenuOpen(false);

            // Optional: send them home after logout
            // navigate("/");
        }
    };


    const handleNavigate = async (to: string) => {
        navigate(to);
    };

    // Close dropdown or mobile menu when clicking outside of it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false); // Close the dropdown menu
            }
            if (menuRef.current && hamburgerButton.current && !menuRef.current.contains(event.target as Node) && !hamburgerButton.current.contains(event.target as Node)) {
                setMenuOpen(false); // Close the hamburger menu
            }
        };

        // Add event listener for clicks on the document
        document.addEventListener("mousedown", handleClickOutside);

        // Cleanup event listener on unmount
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <header className="bg-gradient-to-r from-indigo-400 to-blue-700 text-white w-full h-[5.5rem] shadow-md">
            {/* Outer container with justify-between splits left and right sections */}
            <div className="container mx-auto flex items-center py-4 px-6 justify-between h-full">
                {/* Left Section: Logo (and optional left-side nav links) */}
                <div className="flex items-center space-x-6">
                    <Link
                        to="/"
                        className="text-2xl md:text-3xl font-bold hover:underline text-blue-700 hover:text-blue-500"
                    >
                        AI-Jeopardy.com
                    </Link>

                    {/* Optional navigation links */}
                    <nav className="hidden md:flex items-center space-x-3">
                        <Link
                            to="/recent-boards"
                            className="px-4 text-xl py-2 hover:underline rounded"
                        >
                            Recent Boards
                        </Link>
                    </nav>
                </div>

                {/* Right Section: Login/Profile Button and Hamburger Menu */}
                <div className="flex items-center space-x-4 h-full">
                    {user && profile && userProfile ? (
                        // If logged in, show a profile dropdown menu
                        <div className="hidden relative md:block" ref={dropdownRef}>
                            <button
                                onClick={toggleDropdown}
                                className="flex items-center text-xl px-4 py-2 rounded hover:bg-blue-400 focus:outline-none"
                            >
                                <Avatar
                                    name={profile.displayname}
                                    size="10"
                                    color={userProfile.color}
                                    textColor={userProfile.text_color}
                                />
                                <span className="ml-3">{profile.displayname}</span>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4 ml-2"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                    />
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
                                            to={`/profile/${profile.username}`}
                                            onClick={() => setDropdownOpen(false)}
                                            className="block px-4 py-2 text-blue-600 hover:bg-gray-200"
                                        >
                                            Profile
                                        </Link>

                                        <Link
                                            to={`/profile/${profile.username}/history`}
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
                        // If not logged in, show a Login button
                        <LoginForm />
                    )}
                    {/* Hamburger Menu Button (visible only on small screens) */}
                    <button
                        className="md:hidden flex items-center px-3 py-2 rounded text-white hover:bg-blue-500 focus:outline-none"
                        onClick={() => setMenuOpen(!menuOpen)}
                        ref={hamburgerButton}
                    >
                        {user && profile && userProfile && (
                            <div className="mr-2">
                                <Avatar
                                    name={profile.displayname}
                                    size="10"
                                    color={userProfile.color}
                                    textColor={userProfile.text_color}
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
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6h16M4 12h16M4 18h16"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Navigation Dropdown */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        className="absolute top-[5.5rem] inset-x-0 bg-gray-100 text-black rounded shadow-lg z-50"
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        variants={{
                            hidden: { height: 0, opacity: 0 },
                            visible: { height: "auto", opacity: 1 },
                        }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        ref={menuRef}
                    >
                        <motion.div
                            className="flex flex-col"
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            variants={{
                                hidden: { opacity: 0, transition: { staggerChildren: 0.1, staggerDirection: -1 } }, // Stagger exit direction reversed
                                visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
                            }}
                        >
                            <motion.button
                                className="block px-4 py-2 hover:bg-blue-500 cursor-pointer"
                                onClick={() => {
                                    handleNavigate('/recent-boards');
                                    setDropdownOpen(false);
                                }}
                                variants={{
                                    hidden: { opacity: 0, y: -10 },
                                    visible: { opacity: 1, y: 0 },
                                    exit: { opacity: 0, y: -10 } // Matches exit animation
                                }}
                            >
                                Recent Boards
                            </motion.button>

                            {user && profile && (
                                <>
                                    <motion.button
                                        className="block px-4 py-2 hover:bg-blue-500 cursor-pointer"
                                        variants={{
                                            hidden: { opacity: 0, y: -10 },
                                            visible: { opacity: 1, y: 0 },
                                            exit: { opacity: 0, y: -10 } // Matches exit animation
                                        }}
                                        onClick={() => {
                                            handleNavigate('/profile/' + profile.username);
                                            setDropdownOpen(false);
                                        }}
                                    >
                                        Profile
                                    </motion.button>
                                    <motion.button
                                        className="block px-4 py-2 hover:bg-blue-500 cursor-pointer"
                                        variants={{
                                            hidden: { opacity: 0, y: -10 },
                                            visible: { opacity: 1, y: 0 },
                                            exit: { opacity: 0, y: -10 } // Matches exit animation
                                        }}
                                        onClick={() => {
                                            handleNavigate('/profile/' + profile.username + '/history');
                                            setDropdownOpen(false);
                                        }}
                                    >
                                        History
                                    </motion.button>

                                    <motion.button
                                        className="block px-4 py-2 text-red-600 hover:bg-blue-500 cursor-pointer"
                                        variants={{
                                            hidden: { opacity: 0, y: -10 },
                                            visible: { opacity: 1, y: 0 },
                                            exit: { opacity: 0, y: -10 } // Matches exit animation
                                        }}
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