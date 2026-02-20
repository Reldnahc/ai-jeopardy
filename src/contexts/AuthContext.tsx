// frontend/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type AppUser = {
  id: string;
  email?: string | null;
  username: string;
  role: string;
  displayname?: string | null;
};

type AuthContextType = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  login: (params: { username: string; password: string }) => Promise<void>;
  signup: (params: {
    email?: string | null;
    username: string;
    displayname?: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  updateUser: (patch: Partial<AppUser>) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "aiJeopardy.jwt";

function getApiBase() {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const updateUser: AuthContextType["updateUser"] = (patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  async function fetchMe(t: string) {
    const res = await fetch(`${getApiBase()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
      const msg = payload?.error || text || `HTTP ${res.status}`;
      const err: any = new Error(msg);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    const data = payload ?? (text ? JSON.parse(text) : null);
    return data.user as AppUser;
  }

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const t = localStorage.getItem(TOKEN_KEY);
      if (!t) {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(true);

      try {
        const me = await fetchMe(t);
        if (!cancelled) {
          setUser(me);
          setToken(t);
        }
      } catch (e: any) {
        console.error("AuthContext boot failed:", e);

        const status = e?.status;
        const apiErr = e?.payload?.error;

        const isAuthFailure =
          status === 401 ||
          status === 403 ||
          apiErr === "Invalid token" ||
          apiErr === "Token expired";

        if (!cancelled) {
          if (isAuthFailure) {
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const signup: AuthContextType["signup"] = async ({
    email = null,
    username,
    displayname,
    password,
  }) => {
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
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
