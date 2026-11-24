import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { type Api, createApi } from "@/api/client";
import { clearToken, loadToken, saveToken } from "@/auth/storage";
import { COOKIE_SESSIONS } from "@/auth/webSession";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

/** Kept in memory only, between sign-up and verification (D045). */
export type PendingSignUp = { email: string; password: string };

/** Kept in memory only, between Google's answer and the finish screen (D134). */
export type GoogleSignUp = { ticket: string; email: string; name: string | null };

/** After a deletion request: when everything goes, for the welcome screen (D083). */
export type DeletionNotice = { purgeAfter: string };

type AuthValue = {
  status: AuthStatus;
  api: Api;
  /** The session's token, or nothing when the web app's session went into the API's cookie (D152). */
  signIn: (token?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  pending: PendingSignUp | null;
  setPending: (value: PendingSignUp | null) => void;
  googleSignUp: GoogleSignUp | null;
  setGoogleSignUp: (value: GoogleSignUp | null) => void;
  deletion: DeletionNotice | null;
  /** The server has scheduled the deletion and ended every session: forget this one. */
  accountDeleted: (purgeAfter: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  api: injected,
  cookieSessions = COOKIE_SESSIONS,
}: {
  children: ReactNode;
  api?: Api;
  /** The web app: the session is the API's HttpOnly cookie, out of this page's reach (D152). */
  cookieSessions?: boolean;
}) {
  const queryClient = useQueryClient();
  const tokenRef = useRef<string | null>(null);
  // The web app's cookie session: the page can't see the cookie, only whether it worked.
  const sessionRef = useRef(false);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [pending, setPending] = useState<PendingSignUp | null>(null);
  const [googleSignUp, setGoogleSignUp] = useState<GoogleSignUp | null>(null);
  const [deletion, setDeletion] = useState<DeletionNotice | null>(null);

  const forget = useCallback(async () => {
    tokenRef.current = null;
    sessionRef.current = false;
    await clearToken();
    queryClient.clear(); // no cached personal data survives a sign-out
    setStatus("signedOut");
  }, [queryClient]);

  const api = useMemo(
    () =>
      injected ??
      createApi({
        getToken: () => tokenRef.current,
        hasSession: () => sessionRef.current,
        onUnauthorized: () => {
          void forget();
        },
        cookies: cookieSessions,
      }),
    [injected, forget, cookieSessions],
  );

  useEffect(() => {
    let alive = true;
    if (cookieSessions) {
      // Is this browser still signed in? Only the API can tell: it holds the cookie.
      void api.GET("/v1/me").then(
        ({ response }) => {
          if (!alive) return;
          sessionRef.current = response.ok;
          setStatus(response.ok ? "signedIn" : "signedOut");
        },
        () => {
          if (alive) setStatus("signedOut"); // offline: sign in again once back
        },
      );
    } else {
      void loadToken().then((token) => {
        if (!alive) return;
        tokenRef.current = token;
        setStatus(token ? "signedIn" : "signedOut");
      });
    }
    return () => {
      alive = false;
    };
  }, [api, cookieSessions]);

  const signIn = useCallback(
    async (token?: string | null) => {
      if (token) {
        tokenRef.current = token;
        await saveToken(token);
      } else if (!cookieSessions) {
        throw new Error("The sign-in answer had no session in it.");
      }
      sessionRef.current = true;
      setPending(null);
      setGoogleSignUp(null);
      setDeletion(null);
      setStatus("signedIn");
    },
    [cookieSessions],
  );

  const signOut = useCallback(async () => {
    try {
      await api.DELETE("/v1/me/push-device"); // courtesy: revoking the session already stops pushes
      await api.POST("/v1/auth/logout");
    } catch {
      // Offline: the local session is still forgotten.
    }
    await forget();
  }, [api, forget]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await api.POST("/v1/auth/logout-all");
    } catch {
      // Offline: other devices stay signed in until they next reach the API.
    }
    await forget();
  }, [api, forget]);

  const accountDeleted = useCallback(
    async (purgeAfter: string) => {
      // The realtime connection may already have signed this device out (4401).
      setDeletion({ purgeAfter });
      await forget();
    },
    [forget],
  );

  const value = useMemo(
    () => ({
      status, api, signIn, signOut, signOutEverywhere, pending, setPending, googleSignUp, setGoogleSignUp, deletion,
      accountDeleted,
    }),
    [status, api, signIn, signOut, signOutEverywhere, pending, googleSignUp, deletion, accountDeleted],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
