/** Notification settings (stage 16, D093): this phone, and what to be told about. */
import { useState } from "react";

import { messageFor } from "@/api/messages";
import { type NotificationPrefs, useNotificationPrefs, useSaveNotificationPrefs } from "@/api/hooks";
import { useAuth } from "@/auth/AuthProvider";
import { t } from "@/i18n/en";
import { enablePush, type PushResult } from "@/notifications/push";
import { Body, Button, Checkbox, Heading, Loading, Notice, Screen, Title } from "@/ui/primitives";

const RESULT: Record<PushResult, { kind: "success" | "info" | "error"; text: string }> = {
  enabled: { kind: "success", text: t.notifications.enabled },
  unsupported: { kind: "info", text: t.notifications.unsupported },
  not_configured: { kind: "info", text: t.notifications.notConfigured },
  denied: { kind: "error", text: t.notifications.denied },
};

export function NotificationsScreen() {
  const { api } = useAuth();
  const prefs = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const [result, setResult] = useState<PushResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (prefs.isPending) return <Loading label={t.common.loading} />;

  const turnOn = async () => {
    setBusy(true);
    setFailure(null);
    try {
      setResult(await enablePush(api));
    } catch (err) {
      setFailure(messageFor(err));
    } finally {
      setBusy(false);
    }
  };
  const update = (change: Partial<NotificationPrefs>) => {
    if (!prefs.data) return;
    save.mutate({ ...prefs.data, ...change }, { onError: (err) => setFailure(messageFor(err)) });
  };

  return (
    <Screen>
      <Title>{t.notifications.title}</Title>
      <Body>{t.notifications.intro}</Body>
      <Heading>{t.notifications.thisPhone}</Heading>
      {result ? <Notice kind={RESULT[result].kind}>{RESULT[result].text}</Notice> : null}
      {result !== "enabled" ? (
        <Button label={t.notifications.enable} onPress={() => void turnOn()} busy={busy} />
      ) : null}
      <Heading>{t.notifications.what}</Heading>
      {prefs.data ? (
        <>
          <Checkbox label={t.notifications.matches} checked={prefs.data.matches} onChange={(v) => update({ matches: v })} />
          <Checkbox label={t.notifications.messages} checked={prefs.data.messages} onChange={(v) => update({ messages: v })} />
          <Checkbox label={t.notifications.likes} checked={prefs.data.likes} onChange={(v) => update({ likes: v })} />
        </>
      ) : (
        <Notice kind="error">{messageFor(prefs.error)}</Notice>
      )}
      <Body muted>{t.notifications.alwaysNotices}</Body>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
    </Screen>
  );
}
