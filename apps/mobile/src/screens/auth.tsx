/** Sign-up (age gate, consents), email verification, sign-in, password reset. */
import { zodResolver } from "@hookform/resolvers/zod";
import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

import { ApiError, unwrap } from "@/api/client";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
import { BETA_DOCUMENTS, BRAND, BRAND_DEVANAGARI, DOCUMENT_LINKS, DOCUMENT_VERSIONS, INVITE_ONLY } from "@/config";
import { deletionNotice } from "@/screens/account";
import { fill, t } from "@/i18n/en";
import { FormField } from "@/ui/FormField";
import { color, font, motion, space } from "@/theme/tokens";
import { Reveal } from "@/ui/motion";
import { Body, Button, Caption, Checkbox, Enamel, ExternalLink, FieldError, Label, Notice, Row, Screen, TextLink, Title } from "@/ui/primitives";
import { RouteMap } from "@/ui/RouteMap";
import { WelcomeBackdrop } from "@/ui/WelcomeBackdrop";
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

/**
 * The app's first impression (stage 19, D098-D099): the candlelight loop behind
 * a dark overlay, then the rings meet and the words and buttons rise into place.
 */
const WELCOME_STEP = motion.stagger * 2;

export function WelcomeScreen() {
  const router = useRouter();
  const { deletion } = useAuth();
  return (
    <View style={welcomeStyles.root}>
      <StatusBar style="light" />
      <WelcomeBackdrop />
    <Screen overlay>
      {deletion ? <Notice kind="info">{deletionNotice(t.account.goodbye, deletion.purgeAfter)}</Notice> : null}
      <NameSign />
      <Reveal delay={WELCOME_STEP}>
        <Title display>{t.welcome.title}</Title>
      </Reveal>
      <Reveal delay={WELCOME_STEP * 2}>
        <Body>{t.welcome.body}</Body>
      </Reveal>
      {/* The route map on a white enamel panel: the rings meet at its interchange. */}
      <Enamel>
        <RouteMap />
      </Enamel>
      <Reveal delay={WELCOME_STEP * 3}>
        <Button label={t.welcome.signUp} onPress={() => router.push("/sign-up")} />
      </Reveal>
      <Reveal delay={WELCOME_STEP * 3}>
        <Button label={t.welcome.signIn} variant="secondary" onPress={() => router.push("/sign-in")} />
      </Reveal>
      <Reveal delay={WELCOME_STEP * 4}>
        <Body muted>{t.welcome.adults}</Body>
      </Reveal>
    </Screen>
    </View>
  );
}

/** The station sign: the working name, and in Devanagari when configured (D105). */
function NameSign() {
  return (
    <View style={welcomeStyles.sign}>
      <Text style={welcomeStyles.brand}>{BRAND}</Text>
      {BRAND_DEVANAGARI ? (
        <Text style={welcomeStyles.brandHindi} accessibilityLanguage="hi">
          {BRAND_DEVANAGARI}
        </Text>
      ) : null}
    </View>
  );
}

const welcomeStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.overlay },
  sign: { gap: space.xs / 2 },
  brand: { fontFamily: font.sign, fontSize: 24, lineHeight: 28, letterSpacing: 1, textTransform: "uppercase", color: color.onSign },
  brandHindi: { fontFamily: font.devanagari, fontSize: 20, lineHeight: 26, color: color.onSign },
});

// The forms (D110): a group of fields keeps a field's own rhythm; a consent keeps its link close.
const styles = StyleSheet.create({
  group: { gap: space.xs },
  consent: { gap: space.sm },
});

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
      {/* The date is one labelled group of three fields, with a hint like a field's own (D110). */}
      <View role="group" aria-label={t.signUp.birthdate} style={styles.group}>
        <Label>{t.signUp.birthdate}</Label>
        <Caption>{t.signUp.birthdateHint}</Caption>
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
      </View>
      {/* Each consent keeps its document close: the link to read, then the box to tick. */}
      <View style={styles.consent}>
        <ExternalLink label={t.signUp.readTerms} url={DOCUMENT_LINKS.terms} />
        <Controller control={control} name="terms" render={({ field }) => (
          <Checkbox label={t.signUp.terms} checked={!!field.value} onChange={field.onChange} error={e.terms?.message} />
        )} />
      </View>
      <View style={styles.consent}>
        <ExternalLink label={t.signUp.readPrivacy} url={DOCUMENT_LINKS.privacy} />
        <Controller control={control} name="privacy" render={({ field }) => (
          <Checkbox label={t.signUp.privacy} checked={!!field.value} onChange={field.onChange} error={e.privacy?.message} />
        )} />
      </View>
      <Body muted>{BETA_DOCUMENTS ? t.signUp.betaNotice : t.signUp.draftNotice}</Body>
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
        <Notice kind="info">{t.verify.lost}</Notice>
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
      {INVITE_ONLY ? <Body muted>{t.verify.inviteOnly}</Body> : null}
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
            autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" />
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
