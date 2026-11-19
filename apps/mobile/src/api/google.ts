import { useQuery } from "@tanstack/react-query";

import { type Schemas, unwrap } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";

export type GoogleConfig = Schemas["GoogleConfigOut"];

/**
 * Whether the API offers Google sign-in, with the public IDs the apps start it with
 * (D134). Asked only where this device can use it: a phone build without Google's
 * native part never asks.
 */
export function useGoogleConfig(enabled = true) {
  const { api } = useAuth();
  return useQuery({
    queryKey: ["auth", "google"],
    queryFn: () => unwrap(api.GET("/v1/auth/google")),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
