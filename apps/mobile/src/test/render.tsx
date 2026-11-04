import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { Api } from "@/api/client";
import { AuthProvider } from "@/auth/AuthProvider";

export async function renderWithApp(ui: ReactElement, api: Api) {
  // gcTime Infinity: no garbage-collection timers left running after a test (they kept Jest alive 5 min).
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return await render(
    <QueryClientProvider client={client}>
      <AuthProvider api={api}>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}
