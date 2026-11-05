/** Deleting my account (D083): what happens, then the password. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { unwrap } from "@/api/client";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
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
      <FormField control={control} name="password" label={t.account.password} hint={t.account.passwordHint}
        error={formState.errors.password?.message} secureTextEntry autoComplete="current-password" autoCapitalize="none" />
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Button label={t.account.confirm} variant="danger" onPress={submit} busy={formState.isSubmitting} />
    </Screen>
  );
}
