/** Deleting my account (D083): what happens, then the password (or Google again, D134). */
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { unwrap } from "@/api/client";
import { useGoogleConfig } from "@/api/google";
import { useMe } from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
import { googleSupported, startGoogleSignIn } from "@/auth/googleSignIn";
import { fill, t } from "@/i18n/en";
import { dateInIndia } from "@/i18n/time";
import { FormField } from "@/ui/FormField";
import { Body, Button, Notice, Screen, Title } from "@/ui/primitives";
import { type DeleteAccountValues, deleteAccountSchema } from "@/validation/schemas";

/** "Everything will be deleted on …", or no date once it has passed (an open report can hold the purge). */
export function deletionNotice(template: string, purgeAfter: string | null, now: Date = new Date()): string {
  if (!purgeAfter || new Date(purgeAfter).getTime() <= now.getTime()) return t.account.scheduledNoDate;
  return fill(template, { date: dateInIndia(purgeAfter) });
}

export function DeleteAccountScreen() {
  const { api, accountDeleted } = useAuth();
  const me = useMe();
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<DeleteAccountValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const done = await unwrap(api.POST("/v1/me/deletion", { body: { password: values.password } }));
      // Every session has ended on the server; this one goes too, and the welcome screen says what's next.
      await accountDeleted(done.purge_after);
    } catch (err) {
      setFailure(messageFor(err));
    }
  });

  return (
    <Screen>
      <Title>{t.account.title}</Title>
      <Body>{t.account.intro}</Body>
      <Body>{t.account.now}</Body>
      <Body>{t.account.later}</Body>
      <Body muted>{t.account.kept}</Body>
      <Body muted>{t.account.unreachable}</Body>
      {/* An account made with Google has no password to ask for: Google is asked again. */}
      {me.data?.has_password === false ? (
        <ConfirmWithGoogle />
      ) : (
        <>
          <FormField control={control} name="password" label={t.account.password} hint={t.account.passwordHint}
            error={formState.errors.password?.message} secureTextEntry autoComplete="current-password" autoCapitalize="none" />
          {failure ? <Notice kind="error">{failure}</Notice> : null}
          <Button label={t.account.confirm} variant="danger" onPress={submit} busy={formState.isSubmitting} />
        </>
      )}
    </Screen>
  );
}

/** The same Google account, signed in again just now (the API checks both, D134). */
function ConfirmWithGoogle() {
  const { api, accountDeleted } = useAuth();
  const supported = googleSupported();
  const config = useGoogleConfig(supported);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const settings = config.data;
  if (supported && config.isPending) return null;
  if (!supported || !settings?.enabled || !settings.client_id) return <Notice kind="info">{t.account.googleUnavailable}</Notice>;
  const clientId = settings.client_id;

  const confirm = async () => {
    setBusy(true);
    setFailure(null);
    const got = await startGoogleSignIn({
      clientId, redirectUri: settings.redirect_uri ?? null, purpose: "delete", from: "/delete-account",
    });
    if (got.kind === "redirecting") return; // the web app finishes on its return (/auth/google)
    if (got.kind !== "token") {
      setBusy(false);
      if (got.kind !== "cancelled") setFailure(got.kind === "unavailable" ? t.google.unavailable : t.google.failed);
      return;
    }
    try {
      const done = await unwrap(api.POST("/v1/me/deletion", { body: { google: { id_token: got.idToken } } }));
      await accountDeleted(done.purge_after);
    } catch (err) {
      setFailure(messageFor(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Body>{t.account.withGoogle}</Body>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Button label={t.account.confirm} hint={t.account.withGoogleHint} variant="danger" onPress={() => void confirm()} busy={busy} />
    </>
  );
}
