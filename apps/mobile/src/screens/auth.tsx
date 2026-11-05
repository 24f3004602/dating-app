/** Sign-up (age gate, consents), email verification, sign-in, password reset. */
import { zodResolver } from "@hookform/resolvers/zod";
import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";

import { ApiError, unwrap } from "@/api/client";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
import { DOCUMENT_VERSIONS } from "@/config";
import { deletionNotice } from "@/screens/account";
import { fill, t } from "@/i18n/en";
import { FormField } from "@/ui/FormField";
import { Body, Button, Checkbox, FieldError, Notice, Row, Screen, TextLink, Title } from "@/ui/primitives";
import {
  birthdateIso,
  type CodeValues,
  codeSchema,
  makeSignUpSchema,
  type ResetConfirmValues,
  resetConfirmSchema,
  resetRequestSchema,
  type SignInValues,
  type SignUpValues,
  signInSchema,
} from "@/validation/schemas";

export function WelcomeScreen() {
  const router = useRouter();
  const { deletion } = useAuth();
  return (
    <Screen>
      {deletion ? <Notice kind="info">{deletionNotice(t.account.goodbye, deletion.purgeAfter)}</Notice> : null}
      <Title>{t.welcome.title}</Title>
      <Body>{t.welcome.body}</Body>
      <Button label={t.welcome.signUp} onPress={() => router.push("/sign-up")} />
      <Button label={t.welcome.signIn} variant="secondary" onPress={() => router.push("/sign-in")} />
      <Body muted>{t.welcome.adults}</Body>
    </Screen>
  );
}

export function SignUpScreen({ now }: { now?: () => Date }) {
  const { api, setPending } = useAuth();
  const router = useRouter();
  const schema = useMemo(() => makeSignUpSchema(now), [now]);
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", day: "", month: "", year: "", terms: false, privacy: false },
  });
  const e = formState.errors;

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    const email = values.email.trim().toLowerCase();
    try {
      await unwrap(
        api.POST("/v1/auth/register", {
          body: { email, password: values.password, birthdate: birthdateIso(values), consents: DOCUMENT_VERSIONS },
        }),
      );
      setPending({ email, password: values.password }); // memory only, for the verify step
      router.push("/verify");
    } catch (err) {
      setFailure(messageFor(err));
    }
  });

  return (
    <Screen>
      <Title>{t.signUp.title}</Title>
      <FormField control={control} name="email" label={t.signUp.email} error={e.email?.message}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" />
      <FormField control={control} name="password" label={t.signUp.password} hint={t.signUp.passwordHint}
        error={e.password?.message} secureTextEntry autoComplete="new-password" autoCapitalize="none" />
      <Body>{t.signUp.birthdate}</Body>
      <Body muted>{t.signUp.birthdateHint}</Body>
      <Row>
        <View style={{ flex: 1 }}>
          <FormField control={control} name="day" label={t.signUp.day} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
        </View>
        <View style={{ flex: 1 }}>
          <FormField control={control} name="month" label={t.signUp.month} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
        </View>
        <View style={{ flex: 2 }}>
          <FormField control={control} name="year" label={t.signUp.year} keyboardType="number-pad" inputMode="numeric" maxLength={4} />
        </View>
      </Row>
      <FieldError message={e.day?.message ?? e.month?.message ?? e.year?.message} />
      <Controller control={control} name="terms" render={({ field }) => (
        <Checkbox label={t.signUp.terms} checked={!!field.value} onChange={field.onChange} error={e.terms?.message} />
      )} />
      <Controller control={control} name="privacy" render={({ field }) => (
        <Checkbox label={t.signUp.privacy} checked={!!field.value} onChange={field.onChange} error={e.privacy?.message} />
      )} />
      <Body muted>{t.signUp.draftNotice}</Body>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Button label={t.signUp.submit} onPress={submit} busy={formState.isSubmitting} />
    </Screen>
  );
}

export function VerifyScreen() {
  const { api, pending, signIn } = useAuth();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });

  if (!pending) {
    return (
      <Screen>
        <Title>{t.verify.title}</Title>
        <Notice kind="info">{t.verify.failed}</Notice>
        <Button label={t.verify.restart} onPress={() => router.replace("/sign-up")} />
      </Screen>
    );
  }

  const submit = handleSubmit(async ({ code }) => {
    setFailure(null);
    try {
      const session = await unwrap(
        api.POST("/v1/auth/verify-email", { body: { email: pending.email, code: code.trim(), password: pending.password } }),
      );
      await signIn(session.token);
      router.replace("/profile");
    } catch (err) {
      setFailure(messageFor(err));
    }
  });

  const resend = async () => {
    setFailure(null);
    try {
      await unwrap(api.POST("/v1/auth/resend-code", { body: { email: pending.email } }));
      setInfo(t.verify.resent);
    } catch (err) {
      setFailure(messageFor(err));
    }
  };

  return (
    <Screen>
      <Title>{t.verify.title}</Title>
      <Body>{fill(t.verify.body, { email: pending.email })}</Body>
      <FormField control={control} name="code" label={t.verify.code} error={formState.errors.code?.message}
        keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      {info ? <Notice kind="info">{info}</Notice> : null}
      <Button label={t.verify.submit} onPress={submit} busy={formState.isSubmitting} />
      <Button label={t.verify.resend} variant="secondary" onPress={() => void resend()} />
    </Screen>
  );
}

export function SignInScreen() {
  const { api, signIn } = useAuth();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  // Set when the account is waiting to be deleted (D083): offer to keep it.
  const [scheduled, setScheduled] = useState<{ purgeAfter: string | null } | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const enter = (path: "/v1/auth/login" | "/v1/auth/restore") =>
    handleSubmit(async (values) => {
      setFailure(null);
      try {
        const body = { email: values.email.trim().toLowerCase(), password: values.password };
        const session = await unwrap(api.POST(path, { body }));
        await signIn(session.token);
        router.replace("/profile");
      } catch (err) {
        if (err instanceof ApiError && err.code === "deletion_scheduled") {
          setScheduled({ purgeAfter: err.purgeAfter });
          return;
        }
        setScheduled(null);
        setFailure(messageFor(err));
      }
    });
  const submit = enter("/v1/auth/login");
  const keep = enter("/v1/auth/restore");

  return (
    <Screen>
      <Title>{t.signIn.title}</Title>
      <FormField control={control} name="email" label={t.signUp.email} error={formState.errors.email?.message}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" />
      <FormField control={control} name="password" label={t.signUp.password} error={formState.errors.password?.message}
        secureTextEntry autoComplete="current-password" autoCapitalize="none" />
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      {scheduled ? (
        <>
          <Notice kind="info">{deletionNotice(t.account.scheduled, scheduled.purgeAfter)}</Notice>
          <Button label={t.account.keep} hint={t.account.keepHint} onPress={keep} busy={formState.isSubmitting} />
        </>
      ) : (
        <Button label={t.signIn.submit} onPress={submit} busy={formState.isSubmitting} />
      )}
      <TextLink label={t.signIn.forgot} href={"/reset" as Href} />
    </Screen>
  );
}

export function ResetScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const request = useForm<{ email: string }>({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  const confirm = useForm<ResetConfirmValues>({ resolver: zodResolver(resetConfirmSchema), defaultValues: { code: "", newPassword: "" } });

  const send = request.handleSubmit(async (values) => {
    setFailure(null);
    const normalized = values.email.trim().toLowerCase();
    try {
      await unwrap(api.POST("/v1/auth/password-reset/request", { body: { email: normalized } }));
      setEmail(normalized);
    } catch (err) {
      setFailure(messageFor(err));
    }
  });

  const finish = confirm.handleSubmit(async (values) => {
    if (!email) return;
    setFailure(null);
    try {
      await unwrap(
        api.POST("/v1/auth/password-reset/confirm", { body: { email, code: values.code.trim(), new_password: values.newPassword } }),
      );
      setDone(true);
    } catch (err) {
      setFailure(messageFor(err));
    }
  });

  return (
    <Screen>
      <Title>{t.reset.title}</Title>
      {done ? (
        <>
          <Notice kind="success">{t.reset.done}</Notice>
          <Button label={t.signIn.submit} onPress={() => router.replace("/sign-in")} />
        </>
      ) : email === null ? (
        <>
          <Body>{t.reset.requestBody}</Body>
          <FormField control={request.control} name="email" label={t.signUp.email} error={request.formState.errors.email?.message}
            autoCapitalize="none" keyboardType="email-address" inputMode="email" />
          {failure ? <Notice kind="error">{failure}</Notice> : null}
          <Button label={t.reset.send} onPress={send} busy={request.formState.isSubmitting} />
        </>
      ) : (
        <>
          <Notice kind="info">{t.reset.sent}</Notice>
          <FormField control={confirm.control} name="code" label={t.reset.code} error={confirm.formState.errors.code?.message}
            keyboardType="number-pad" inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
          <FormField control={confirm.control} name="newPassword" label={t.reset.newPassword} hint={t.signUp.passwordHint}
            error={confirm.formState.errors.newPassword?.message} secureTextEntry autoComplete="new-password" autoCapitalize="none" />
          {failure ? <Notice kind="error">{failure}</Notice> : null}
          <Button label={t.reset.submit} onPress={finish} busy={confirm.formState.isSubmitting} />
        </>
      )}
    </Screen>
  );
}
