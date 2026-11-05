import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { type Api, createApi } from "@/api/client";
import { clearToken, loadToken, saveToken } from "@/auth/storage";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

/** Kept in memory only, between sign-up and verification (D045). */
export type PendingSignUp = { email: string; password: string };

/** After a deletion request: when everything goes, for the welcome screen (D083). */
export type DeletionNotice = { purgeAfter: string };

type AuthValue = {
  status: AuthStatus;
  api: Api;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  pending: PendingSignUp | null;
  setPending: (value: PendingSignUp | null) => void;
  deletion: DeletionNotice | null;
  /** The server has scheduled the deletion and ended every session: forget this one. */
  accountDeleted: (purgeAfter: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children, api: injected }: { children: ReactNode; api?: Api }) {
  const queryClient = useQueryClient();
  const tokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [pending, setPending] = useState<PendingSignUp | null>(null);
  const [deletion, setDeletion] = useState<DeletionNotice | null>(null);

  const forget = useCallback(async () => {
    tokenRef.current = null;
    await clearToken();
    queryClient.clear(); // no cached personal data survives a sign-out
    setStatus("signedOut");
  }, [queryClient]);

  const api = useMemo(
    () =>
      injected ??
      createApi({
        getToken: () => tokenRef.current,
        onUnauthorized: () => {
          void forget();
        },
      }),
    [injected, forget],
  );

  useEffect(() => {
    let alive = true;
    void loadToken().then((token) => {
      if (!alive) return;
      tokenRef.current = token;
      setStatus(token ? "signedIn" : "signedOut");
    });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    tokenRef.current = token;
    await saveToken(token);
    setPending(null);
    setDeletion(null);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    try {
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
    () => ({ status, api, signIn, signOut, signOutEverywhere, pending, setPending, deletion, accountDeleted }),
    [status, api, signIn, signOut, signOutEverywhere, pending, deletion, accountDeleted],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
