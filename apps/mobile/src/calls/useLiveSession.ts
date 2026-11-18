/** A Live session for the screen that shows it (stage 23, D123). */
import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";

import { liveApi, liveKeys } from "@/api/live";
import { useAuth } from "@/auth/AuthProvider";
import { onCallUpdated } from "@/calls/events";
import { makeLink } from "@/calls/peer";
import { openCamera, peerConnection } from "@/calls/rtc";
import { type LiveRtc, LiveSession, type LiveState } from "@/calls/session";

export const platformRtc: LiveRtc = {
  openCamera,
  link: (ice, camera) => makeLink(peerConnection(), ice, camera),
};

export function useLiveSession(rtc: LiveRtc = platformRtc): { state: LiveState; session: LiveSession } {
  const { api } = useAuth();
  const qc = useQueryClient();
  // One device ID per screen visit: the server gives a call to the device that waited.
  const [session] = useState(() => new LiveSession({ api: liveApi(api), rtc, clientId: Crypto.randomUUID() }));
  const [state, setState] = useState(() => session.getState());
  useEffect(() => session.subscribe(setState), [session]);
  useEffect(() => onCallUpdated((id) => session.onCallUpdated(id)), [session]);
  useEffect(() => () => session.stop(), [session]);
  // Free calls left and the like after a call change when a call ends.
  useEffect(() => {
    if (state.phase === "ended" || state.phase === "idle") void qc.invalidateQueries({ queryKey: liveKeys.live });
  }, [state.phase, qc]);
  return { state, session };
}
