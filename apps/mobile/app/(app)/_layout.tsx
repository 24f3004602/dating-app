import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { useReducedMotion } from "@/ui/motion";
import { t } from "@/i18n/en";
import { NotificationRouter } from "@/notifications/NotificationRouter";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { Loading } from "@/ui/primitives";

// Every screen in this group needs a session; the API checks it again.
export default function AppLayout() {
  const { status } = useAuth();
  const reduced = useReducedMotion();
  if (status === "loading") return <Loading label={t.common.loading} />;
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return (
    <RealtimeProvider>
      <NotificationRouter />
      <Stack screenOptions={{ headerShown: true, title: "", animation: reduced ? "none" : "default" }} />
    </RealtimeProvider>
  );
}
