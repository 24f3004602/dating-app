import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/auth/AuthProvider";
import { useReducedMotion } from "@/ui/motion";

export default function RootLayout() {
  const reduced = useReducedMotion();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false, animation: reduced ? "none" : "default" }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
