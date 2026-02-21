import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../common/Avatar";
import { fetchJson, getApiBase } from "../../utils/utils.ts";
import { getProfilePresentation } from "../../utils/profilePresentation.ts";
import type { Profile } from "../../contexts/ProfileContext";
import type { ProfileIconName } from "../common/profileIcons.tsx";

type ProfileSearchRow = {
  username: string;
  displayname: string;
  color: string | null;
  text_color: string | null;

  name_color?: string | null;
  border?: string | null;
  font?: string | null;
  icon?: ProfileIconName | null;
};

function toSearchProfile(u: ProfileSearchRow): Profile {
  const username = String(u.username ?? "")
    .trim()
    .toLowerCase();
  const displayname = String(u.displayname ?? username).trim();

  return {
    id: `search:${username}`, // synthetic but stable
    username,
    displayname,

    // cosmetics (fallbacks)
    color: u.color ?? "#3b82f6",
    text_color: u.text_color ?? "#ffffff",
    name_color: u.name_color ?? "#111827",
    border: u.border ?? "",
    font: u.font ?? null,
    icon: (u.icon as ProfileIconName) ?? null,

    // optional Profile fields
    role: "default",
    email: null,
    tokens: null,
    created_at: undefined,
    updated_at: undefined,
  };
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

    if (!t || t.length < 2) {
      setMatchingUsers([]);
      setIsDropdownVisible(false);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);

    try {
      const data = await fetchJson<{ users: ProfileSearchRow[] }>(
        `${apiBase}/api/profile/search?q=${encodeURIComponent(t)}&limit=5`,
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
    navigate(`/profile/${encodeURIComponent(username)}`);
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
          <span className="opacity-0">placeholder</span>
        )}
      </div>

      {isDropdownVisible && matchingUsers.length > 0 && (
        <ul
          className="absolute left-0 right-0 bg-white border border-gray-300 rounded shadow-lg z-10"
          style={{ top: "calc(100% - 1rem)" }} // subtract helper line height
        >
          {matchingUsers.map((user) => {
            const pres = getProfilePresentation({
              profile: toSearchProfile(user),
              fallbackName: user.displayname || user.username,
              defaultNameColor: "#111827",
            });

            return (
              <li
                key={user.username}
                className="p-3 hover:bg-blue-100 cursor-pointer text-black flex items-center space-x-3"
                style={{ minHeight: "3rem" }}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => handleUserSelect(user.username)}
              >
                <div className="w-8 h-8 flex-shrink-0">
                  <Avatar
                    name={pres.avatar.nameForLetter}
                    color={pres.avatar.bgColor}
                    textColor={pres.avatar.fgColor}
                    icon={pres.avatar.icon}
                    size="9"
                  />
                </div>

                <span className="min-w-0 truncate">
                  <span className={pres.nameClassName} style={pres.nameStyle ?? undefined}>
                    {user.displayname}
                  </span>
                </span>

                <span className="ml-auto text-xs text-gray-500">@{user.username}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PlayerSearch;
