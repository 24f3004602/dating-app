/** The web app has no ads (D137): Google's ad scripts would run beside members' chats. */
import type { ReactNode } from "react";

export function AdsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAds(): { banners: boolean } {
  return { banners: false };
}
