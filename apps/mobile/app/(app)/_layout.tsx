import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { t } from "@/i18n/en";
import { Loading } from "@/ui/primitives";

// Every screen in this group needs a session; the API checks it again.
export default function AppLayout() {
  const { status } = useAuth();
  if (status === "loading") return <Loading label={t.common.loading} />;
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return <Stack screenOptions={{ headerShown: true, title: "" }} />;
}
