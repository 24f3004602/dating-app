import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Api } from "@/api/client";
import { AuthProvider } from "@/auth/AuthProvider";

const METRICS = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 44, right: 0, bottom: 24, left: 0 } };

export async function renderWithApp(ui: ReactElement, api: Api) {
  // gcTime Infinity: no garbage-collection timers left running after a test (they kept Jest alive 5 min).
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  // The app's root provides safe-area insets (expo-router does); sheets read them.
  return await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <AuthProvider api={api}>{ui}</AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
