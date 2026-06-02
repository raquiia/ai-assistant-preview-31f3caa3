import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiClient } from "./api";
import type { Session } from "./types";

interface AuthContextValue {
  session: Session | null;
  hydrated: boolean;
  api: ApiClient;
  setSession: (session: Session | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "mp-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setSessionState(JSON.parse(stored) as Session); } catch { /* noop */ }
    }
    setHydrated(true);
  }, []);

  const setSession = (next: Session | null) => {
    setSessionState(next);
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  // ApiClient stable: lit toujours la dernière session via ref-like closure
  const api = useMemo(() => new ApiClient(() => session), [session]);

  return (
    <AuthContext.Provider value={{ session, hydrated, api, setSession, logout: () => setSession(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
