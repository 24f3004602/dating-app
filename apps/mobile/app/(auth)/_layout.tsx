import { Redirect, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "@/auth/AuthProvider";
import { signHeader } from "@/ui/header";
import { useReducedMotion } from "@/ui/motion";
import { ScreenEdges, UNDER_TOP_BAR } from "@/ui/primitives";

// Signed-in members never see the sign-up and sign-in screens.
export default function AuthLayout() {
  const { status } = useAuth();
  const reduced = useReducedMotion();
  if (status === "signedIn") return <Redirect href="/profile" />;
  return (
    <>
      <StatusBar style="light" />
      {/* The top bar covers the top edge (the welcome screen, which has none, sets its own). */}
      <ScreenEdges.Provider value={UNDER_TOP_BAR}>
        <Stack screenOptions={{ ...signHeader, headerShown: true, title: "", animation: reduced ? "none" : "default" }}>
          {/* The welcome screen fills the screen with its video (stage 19): no empty header bar on top. */}
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack>
      </ScreenEdges.Provider>
    </>
  );
}
