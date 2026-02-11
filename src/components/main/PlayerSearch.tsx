import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../common/Avatar";

type ProfileSearchRow = {
    username: string;
    displayname: string;
    color: string | null;
    text_color: string | null;
};

function getApiBase() {
    // In dev, allow explicit override
    if (import.meta.env.DEV) {
        return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    }

    // In prod, use same-origin
    return "";
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const text = await res.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
        const msg = payload?.error || text || `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return payload as T;
}

const PlayerSearch: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [matchingUsers, setMatchingUsers] = useState<ProfileSearchRow[]>([]);
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const apiBase = useMemo(() => getApiBase(), []);

    const requestSeq = useRef(0);

    const trimmed = searchQuery.trim();
    const tooShort = trimmed.length > 0 && trimmed.length < 2;

    const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setSearchQuery(next);

        const t = next.trim();

        if (!t) {
            setMatchingUsers([]);
            setIsDropdownVisible(false);
            setLoading(false);
            return;
        }

        if (t.length < 2) {
            setMatchingUsers([]);
            setIsDropdownVisible(false);
            setLoading(false);
            return;
        }

        const seq = ++requestSeq.current;
        setLoading(true);

        try {
            const data = await fetchJson<{ users: ProfileSearchRow[] }>(
                `${apiBase}/api/profile/search?q=${encodeURIComponent(t)}&limit=5`
            );

            // ignore out-of-order responses
            if (seq !== requestSeq.current) return;

            const users = data.users ?? [];
            setMatchingUsers(users);
            setIsDropdownVisible(users.length > 0);
        } catch (err) {
            if (seq !== requestSeq.current) return;
            console.error("Error searching users:", err);
            setMatchingUsers([]);
            setIsDropdownVisible(false);
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    };

    const handleUserSelect = (username: string) => {
        setIsDropdownVisible(false);
        navigate(`/profile/${username}`);
    };

    return (
        <div className="relative w-full">
            <label className="block text-2xl font-semibold text-gray-700 mb-2" htmlFor="player-search">
                Search for a Player
            </label>

            <input
                type="text"
                id="player-search"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Start typing a username..."
                className="w-full p-3 border border-gray-300 text-black rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
                onFocus={() => {
                    if (matchingUsers.length > 0) setIsDropdownVisible(true);
                }}
                onBlur={() => {
                    // small delay so click registers
                    setTimeout(() => setIsDropdownVisible(false), 150);
                }}
            />

            {/* Reserve space so the page doesn't jump */}
            <div className="mt-1 min-h-[1rem] text-xs text-gray-500">
                {tooShort ? (
                    <>
                        Type <span className="font-semibold">2+</span> characters to search.
                    </>
                ) : loading ? (
                    <>Searching…</>
                ) : (
                    // keep height, show nothing
                    <span className="opacity-0">placeholder</span>
                )}
            </div>


            {isDropdownVisible && matchingUsers.length > 0 && (
                <ul
                    className="absolute left-0 right-0 bg-white border border-gray-300 rounded shadow-lg z-10"
                    style={{ top: "calc(100% - 1rem)" }} // subtract the helper line height (min-h-[1rem])
                >
                    {matchingUsers.map((user) => (
                        <li
                            key={user.username}
                            className="p-3 hover:bg-blue-100 cursor-pointer text-black flex items-center space-x-3"
                            style={{ minHeight: "3rem" }}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => handleUserSelect(user.username)}
                        >
                            <Avatar
                                size={"8"}
                                name={user.username}
                                color={user.color ?? undefined}
                                textColor={user.text_color ?? undefined}
                            />
                            <span className="whitespace-nowrap">{user.displayname}</span>
                            <span className="ml-auto text-xs text-gray-500">@{user.username}</span>
                        </li>
                    ))}
                </ul>
            )}

        </div>
    );
};

export default PlayerSearch;
