import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { Branding, Me } from "../api/types";

export interface SetUpForm {
  org_name: string;
  display_name: string;
  username: string;
  password: string;
}

interface AuthState {
  /** The first look at the branding and who is signed in has finished. */
  ready: boolean;
  branding: Branding | null;
  me: Me | null;
  /** Why that look failed, kept so it can be tried again. */
  trouble: string | null;
  retry: () => void;
  reloadBranding: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  setUp: (form: SetUpForm) => Promise<void>;
  signOut: () => Promise<void>;
  can: (scope: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.onSignedOut = () => setMe(null);
    let live = true;
    (async () => {
      try {
        const found = await api.get<Branding>("/v1/branding");
        let who: Me | null = null;
        if (!found.setup_needed) {
          try {
            who = await api.get<Me>("/v1/auth/me");
          } catch (e) {
            // signed out is an answer, not trouble
            if (!(e instanceof ApiError && e.status === 401)) throw e;
          }
        }
        if (live) {
          setBranding(found);
          setMe(who);
          setTrouble(null);
        }
      } catch (e) {
        if (live) setTrouble((e as Error).message);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setReady(false);
    setAttempt((n) => n + 1);
  }, []);

  const reloadBranding = useCallback(async () => {
    setBranding(await api.get<Branding>("/v1/branding"));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setMe(await api.post<Me>("/v1/auth/sign-in", { username, password }));
  }, []);

  const setUp = useCallback(async (form: SetUpForm) => {
    const admin = await api.post<Me>("/v1/setup", form);
    // both at once, so first run hands straight over to the signed-in app
    setMe(admin);
    setBranding({ setup_needed: false, org_name: form.org_name.trim(), logo_id: null });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/v1/auth/sign-out");
    } catch {
      /* signed out here whatever the API says */
    }
    setMe(null);
  }, []);

  const can = useCallback((scope: string) => {
    if (!me) return false;
    const area = scope.split(":")[0];
    return me.scopes.includes("*") || me.scopes.includes(scope) || me.scopes.includes(`${area}:*`);
  }, [me]);

  const value = useMemo(
    () => ({ ready, branding, me, trouble, retry, reloadBranding, signIn, setUp, signOut, can }),
    [ready, branding, me, trouble, retry, reloadBranding, signIn, setUp, signOut, can],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
