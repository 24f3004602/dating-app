import { Redirect, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "@/auth/AuthProvider";
import { useReducedMotion } from "@/ui/motion";
import { t } from "@/i18n/en";
import { NotificationRouter } from "@/notifications/NotificationRouter";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { signHeader } from "@/ui/header";
import { Loading, ScreenEdges, UNDER_TOP_BAR } from "@/ui/primitives";

// Every screen in this group needs a session; the API checks it again.
export default function AppLayout() {
  const { status } = useAuth();
  const reduced = useReducedMotion();
  if (status === "loading") return <Loading label={t.common.loading} />;
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return (
    <RealtimeProvider>
      <NotificationRouter />
      <StatusBar style="light" />
      {/* The top bar covers the top edge; the tabs set their own edges. */}
      <ScreenEdges.Provider value={UNDER_TOP_BAR}>
        <Stack screenOptions={{ ...signHeader, headerShown: true, title: "", animation: reduced ? "none" : "default" }}>
          {/* The four main places carry their own sign band and bottom bar (stage 20e). */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ScreenEdges.Provider>
    </RealtimeProvider>
  );
}
