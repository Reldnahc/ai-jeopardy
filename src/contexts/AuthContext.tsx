import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

type AppUser = {
    id: string;
    email?: string | null;
    username: string;
    role: string;
    displayname?: string | null;
    color?: string | null;
    text_color?: string | null;
};

type AuthContextType = {
    user: AppUser | null;
    token: string | null;
    loading: boolean;
    login: (params: { username: string; password: string }) => Promise<void>;
    signup: (params: { email?: string | null; username: string; displayname?: string; password: string }) => Promise<void>;
    logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "aiJeopardy.jwt";

function getApiBase() {
    return import.meta.env.VITE_API_BASE || "http://localhost:3002";
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AppUser | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
    const [loading, setLoading] = useState(true);

    async function fetchMe(t: string) {
        const res = await fetch(`${getApiBase()}/api/auth/me`, {
            headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) throw new Error("me failed");
        const data = await res.json();
        return data.user as AppUser;
    }

    useEffect(() => {
        (async () => {
            try {
                if (!token) return;
                const me = await fetchMe(token);
                setUser(me);
            } catch {
                localStorage.removeItem(TOKEN_KEY);
                setToken(null);
                setUser(null);
            } finally {
                setLoading(false);
            }
        })();
        if (!token) setLoading(false);
    }, [token]);

    const login: AuthContextType["login"] = async ({ username, password }) => {
        const res = await fetch(`${getApiBase()}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Login failed");

        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
    };

    const signup: AuthContextType["signup"] = async ({ email = null, username, displayname, password }) => {
        const res = await fetch(`${getApiBase()}/api/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, username, displayname, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Signup failed");

        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
    };

    const logout = () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
