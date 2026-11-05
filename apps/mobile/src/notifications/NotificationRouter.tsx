/**
 * On phones: while the app is open, pushes stay quiet (the screens already
 * update live); a tapped push opens the matching list. Nothing on the web.
 */
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { routeFor } from "@/notifications/push";

const NATIVE = Platform.OS === "ios" || Platform.OS === "android";

if (NATIVE) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export function NotificationRouter() {
  const router = useRouter();
  useEffect(() => {
    if (!NATIVE) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const to = routeFor(response.notification.request.content.data);
      if (to) router.push(to);
    });
    return () => sub.remove();
  }, [router]);
  return null;
}
