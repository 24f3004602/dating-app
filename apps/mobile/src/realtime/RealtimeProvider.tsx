/** Keeps the realtime connection open while signed in and the app is in the
 * foreground, and turns its hints into query refreshes (D074). */
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

import { unwrap } from "@/api/client";
import { chatKeys, discoveryKeys, matchingKeys } from "@/api/hooks";
import { useAuth } from "@/auth/AuthProvider";
import { API_URL } from "@/config";
import { RealtimeClient, type RealtimeEvent, realtimeUrl, type RealtimeStatus, type SocketLike } from "@/realtime/client";

// "connecting" outside a provider: no offline notice when nothing is connecting at all.
const StatusContext = createContext<RealtimeStatus>("connecting");

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(StatusContext);
}

type Props = {
  children: ReactNode;
  /** Tests pass a fake; the app uses the platform's WebSocket. */
  openSocket?: (url: string) => SocketLike;
};

export function RealtimeProvider({ children, openSocket }: Props) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    const refresh = (event: RealtimeEvent) => {
      void qc.invalidateQueries({ queryKey: matchingKeys.matches });
      if (event.type === "message.created") {
        void qc.invalidateQueries({ queryKey: chatKeys.conversation(event.match_id) });
      } else if (event.type === "match.created") {
        void qc.invalidateQueries({ queryKey: matchingKeys.likes });
        void qc.invalidateQueries({ queryKey: discoveryKeys.today });
      }
    };
    const client = new RealtimeClient({
      getTicket: async () => (await unwrap(api.POST("/v1/realtime/ticket"))).ticket,
      url: (ticket) => realtimeUrl(API_URL, ticket),
      openSocket: openSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike),
      onEvent: refresh,
      onCatchUp: () => {
        void qc.invalidateQueries({ queryKey: matchingKeys.matches });
        void qc.invalidateQueries({ queryKey: matchingKeys.likes });
        void qc.invalidateQueries({ queryKey: chatKeys.all });
      },
      // The session ended elsewhere: any request now gets 401, which signs out.
      onSessionEnded: () => void api.GET("/v1/me"),
      onStatus: setStatus,
    });
    client.start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") client.start();
      else if (state === "background") client.stop();
    });
    return () => {
      sub.remove();
      client.stop();
    };
  }, [api, qc, openSocket]);

  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}
