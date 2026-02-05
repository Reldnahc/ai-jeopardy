import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "./AuthContext";

export interface Profile {
    id: string;
    username: string;
    displayname: string;
    bio?: string | null;
    color?: string | null;
    text_color?: string | null;

    // public-ish stats
    boards_generated?: number | null;
    games_finished?: number | null;
    games_won?: number | null;
    money_won?: number | null;

    // private-only fields may exist on /me, but public route won't include them
    email?: string | null;
    role?: string | null;
    tokens?: number | null;
}

interface ProfileContextType {
    profile: Profile | null;
    loading: boolean;
    error: string | null;
    refetchProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
    profile: null,
    loading: true,
    error: null,
    refetchProfile: async () => {},
});

function getApiBase() {
    // In dev, allow explicit override
    if (import.meta.env.DEV) {
        return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    }

    // In prod, use same-origin
    return "";
}

function normalizeUsername(u: string) {
    return u.trim().toLowerCase();
}

export const ProfileProvider: React.FC<{ children: ReactNode; username?: string | null }> = ({
                                                                                                 children,
                                                                                                 username,
                                                                                             }) => {
    const { token, user, loading: authLoading } = useAuth();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProfile = async () => {
        setError(null);
        setProfileLoading(true);

        try {
            const api = getApiBase();

            // If a username was provided, load PUBLIC profile
            if (username && username.trim().length) {
                const u = normalizeUsername(username);
                const res = await fetch(`${api}/api/profile/${encodeURIComponent(u)}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || "Failed to load profile");
                setProfile(data.profile);
                return;
            }

            // Otherwise, if logged in, load PRIVATE /me profile
            if (token) {
                const res = await fetch(`${api}/api/profile/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || "Failed to load profile");
                setProfile(data.profile);
                return;
            }

            // Not logged in + no username → nothing to load
            setProfile(null);
        } catch (e: any) {
            setError(String(e?.message || e));
            setProfile(null);
        } finally {
            setProfileLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading) return;
        void fetchProfile();
        // Re-run when the route username changes or token changes
    }, [authLoading, token, user?.id, username]);

    return (
        <ProfileContext.Provider
            value={{
                profile,
                loading: profileLoading,
                error,
                refetchProfile: fetchProfile,
            }}
        >
            {children}
        </ProfileContext.Provider>
    );
};

export const useProfile = () => useContext(ProfileContext);
