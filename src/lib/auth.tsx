import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, setToken, setUnauthorizedHandler, getToken } from "./api";
import type { AuthUser, LoginResponse } from "./types";

interface AuthState {
  user: AuthUser | null;
  isAdmin: boolean;
  isClinician: boolean;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isClinician, setIsClinician] = useState(false);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsAdmin(false);
    setIsClinician(false);
  }, []);

  // A token in sessionStorage is only a claim; ask the API who it belongs to.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get<LoginResponse>("/api/auth/me")
      .then((me) => {
        // Access can be revoked between sessions; a stored token alone is not
        // authority, so drop it rather than showing a portal that 403s.
        if (!me.is_clinician && !me.is_admin) {
          signOut();
          return;
        }
        setUser(me.user);
        setIsAdmin(me.is_admin);
        setIsClinician(me.is_clinician);
        if (me.access_token) setToken(me.access_token);
      })
      .catch(() => signOut())
      .finally(() => setReady(true));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResponse>("/api/auth/login", { email, password });
    if (!res.is_clinician && !res.is_admin) {
      throw new ApiError(
        403,
        "This portal is for administrators and doctors. Students sign in to the AMC Compass app instead; doctors, ask an administrator to add you.",
      );
    }
    setToken(res.access_token);
    setUser(res.user);
    setIsAdmin(res.is_admin);
    setIsClinician(res.is_clinician);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, isAdmin, isClinician, ready, signIn, signOut }),
    [user, isAdmin, isClinician, ready, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
