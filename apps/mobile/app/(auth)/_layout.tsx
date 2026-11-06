import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { useReducedMotion } from "@/ui/motion";

// Signed-in members never see the sign-up and sign-in screens.
export default function AuthLayout() {
  const { status } = useAuth();
  const reduced = useReducedMotion();
  if (status === "signedIn") return <Redirect href="/profile" />;
  return <Stack screenOptions={{ headerShown: true, title: "", animation: reduced ? "none" : "default" }} />;
}
