import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LoginForm from "./LoginForm.tsx";
import { motion, AnimatePresence } from "framer-motion";
import { useAlert } from "../../contexts/AlertContext.tsx";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import { getProfilePresentation } from "../../utils/profilePresentation.ts";
import UserHeaderButton from "../header/UserHeaderButton.tsx";

type NavItem =
  | { key: string; label: string; to: string; kind: "link" }
  | { key: string; label: string; kind: "action"; danger?: boolean; onClick: () => void };

const Header: React.FC = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { user, logout } = useAuth();
  const { profile } = useProfile();

  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);

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
        ],
      );
      return;
    }

    logout();
    closeAllMenus();
  };

  // Close dropdown or mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      const clickedDesktop = desktopRef.current && desktopRef.current.contains(target);

      const clickedMobileButton = mobileRef.current && mobileRef.current.contains(target);

      const clickedMobileMenu = menuRef.current && menuRef.current.contains(target);

      if (!clickedDesktop) setDropdownOpen(false);

      if (!clickedMobileButton && !clickedMobileMenu) setMenuOpen(false);
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

  // Account menu items (desktop dropdown + mobile). Only if logged in.
  const accountItems = useMemo<NavItem[]>(() => {
    if (!user) return [];
    const u = user.username;
    return [
      { key: "profile", label: "Profile", to: `/profile/${u}`, kind: "link" },
      { key: "history", label: "History", to: `/profile/${u}/history`, kind: "link" },
      { key: "stats", label: "Stats", to: `/profile/${u}/stats`, kind: "link" },
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

          <nav className="hidden lg:flex items-center space-x-3 mt-2">
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

        {/* Right: Login/Profile + Mobile button */}
        <div className="flex items-center space-x-4 h-full">
          {user ? (
            <>
              {/* Desktop dropdown */}
              <div className="hidden relative lg:block" ref={desktopRef}>
                <UserHeaderButton
                  pres={pres}
                  dropdownOpen={dropdownOpen}
                  setDropdownOpen={setDropdownOpen}
                />

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

              {/* Mobile button (compact) */}
              <div className="lg:hidden relative" ref={mobileRef}>
                <UserHeaderButton
                  pres={pres}
                  dropdownOpen={menuOpen}
                  setDropdownOpen={setMenuOpen}
                  compact
                />
              </div>
            </>
          ) : (
            <LoginForm />
          )}
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
            variants={{
              hidden: { height: 0, opacity: 0 },
              visible: { height: "auto", opacity: 1 },
            }}
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
