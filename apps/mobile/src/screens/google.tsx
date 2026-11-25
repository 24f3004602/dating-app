/**
 * Sign in with Google (D134): the button on the welcome, sign-in and sign-up screens,
 * the web app's return from Google's page, and finishing a new account with the same
 * age gate and documents as any sign-up.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Platform, StyleSheet, View } from "react-native";

import { ApiError, type Schemas, unwrap } from "@/api/client";
import { useGoogleConfig } from "@/api/google";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
import { googleSupported, startGoogleSignIn, takeGoogleReturn } from "@/auth/googleSignIn";
import type { GoogleFrom, GoogleReturn } from "@/auth/googleTypes";
import { BETA_DOCUMENTS } from "@/config";
import { fill, t } from "@/i18n/en";
import { deletionNotice } from "@/screens/account";
import { BirthAndConsentFields, useDocumentVersions } from "@/screens/signUpFields";
import { space } from "@/theme/tokens";
import { Reveal } from "@/ui/motion";
import { Body, Button, Caption, GoogleButton, Notice, Screen, Title } from "@/ui/primitives";
import { birthdateIso, type GoogleFinishValues, makeGoogleFinishSchema } from "@/validation/schemas";

type SignInBody = Schemas["GoogleSignInIn"];

/** Google's answer, sent to the API: signed in, a new account to finish, or why not. */
function useGoogleAnswer(navigate: "push" | "replace") {
  const { api, signIn, setGoogleSignUp } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Waiting to be deleted (D083): offer to keep it, as the sign-in screen does.
  const [scheduled, setScheduled] = useState<{ purgeAfter: string | null } | null>(null);

  const send = async (body: SignInBody) => {
    setBusy(true);
    setFailure(null);
    try {
      const out = await unwrap(api.POST("/v1/auth/google", { body }));
      setScheduled(null);
      if (out.session) {
        await signIn(out.session.token);
        router.replace("/profile");
      } else if (out.ticket) {
        setGoogleSignUp({ ticket: out.ticket, email: out.email ?? "", name: out.name ?? null });
        if (navigate === "push") router.push("/google-finish");
        else router.replace("/google-finish");
      } else {
        setFailure(t.common.unknownError);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "deletion_scheduled") {
        setScheduled({ purgeAfter: err.purgeAfter });
      } else {
        setScheduled(null);
        setFailure(messageFor(err));
      }
    } finally {
      setBusy(false);
    }
  };
  return { busy, setBusy, failure, setFailure, scheduled, send };
}

/** "or", then Google's button: where the API offers it and this device can use it. */
export function GoogleSignInSection({ from, delay }: { from: GoogleFrom; delay?: number }) {
  const supported = googleSupported();
  const config = useGoogleConfig(supported);
  const flow = useGoogleAnswer("push");
  // The phone's token, kept for "Keep my account" (the API checks it again).
  const [token, setToken] = useState<string | null>(null);
  const { setBusy } = flow;
  // Back from Google's page by the browser's Back button, the page can return exactly as it
  // was left (the back-forward cache), still busy: make the button usable again.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, [setBusy]);
  const settings = config.data;
  if (!supported || !settings?.enabled || !settings.client_id) return null;
  const clientId = settings.client_id;

  const start = async (restore: boolean) => {
    if (restore && token) {
      await flow.send({ id_token: token, restore: true });
      return;
    }
    flow.setBusy(true);
    flow.setFailure(null);
    const got = await startGoogleSignIn({ clientId, redirectUri: settings.redirect_uri ?? null, purpose: "sign-in", restore, from });
    if (got.kind === "redirecting") return; // the web app is leaving for Google's page
    flow.setBusy(false);
    if (got.kind === "token") {
      setToken(got.idToken);
      await flow.send({ id_token: got.idToken, restore });
    } else if (got.kind === "unavailable") {
      flow.setFailure(t.google.unavailable);
    } else if (got.kind === "failed") {
      flow.setFailure(t.google.failed);
    }
  };

  const section = (
    <View style={styles.section}>
      <View style={styles.or}>
        <Caption>{t.google.or}</Caption>
      </View>
      <GoogleButton label={t.google.button} onPress={() => void start(false)} busy={flow.busy} />
      {flow.failure ? <Notice kind="error">{flow.failure}</Notice> : null}
      {flow.scheduled ? (
        <>
          <Notice kind="info">{deletionNotice(t.account.scheduled, flow.scheduled.purgeAfter)}</Notice>
          <Button label={t.account.keep} hint={t.account.keepHint} onPress={() => void start(true)} busy={flow.busy} />
        </>
      ) : null}
    </View>
  );
  return delay === undefined ? section : <Reveal delay={delay}>{section}</Reveal>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The web app, back from Google's page (/auth/google): finish what was started there. */
export function GoogleReturnScreen() {
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const { status, api, accountDeleted } = useAuth();
  const router = useRouter();
  const config = useGoogleConfig();
  const flow = useGoogleAnswer("replace");
  const [answer, setAnswer] = useState<GoogleReturn | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const taken = useRef(false);

  useEffect(() => {
    // Once, after the saved session (if any) is read: a deletion needs it.
    if (taken.current || status === "loading") return;
    taken.current = true;
    const back = takeGoogleReturn({ code: one(params.code), state: one(params.state), error: one(params.error) });
    // The code works once; it doesn't stay in the address bar or the history.
    if (Platform.OS === "web" && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
    setAnswer(back);
    if (back.kind === "cancelled") {
      router.replace(back.from);
    } else if (back.kind === "failed") {
      setFailure(t.google.failed);
    } else if (back.purpose === "sign-in") {
      void flow.send({ code: back.code, code_verifier: back.verifier, restore: back.restore });
    } else if (status !== "signedIn") {
      setFailure(t.google.signedOut);
    } else {
      void (async () => {
        try {
          const body = { google: { code: back.code, code_verifier: back.verifier } };
          const done = await unwrap(api.POST("/v1/me/deletion", { body }));
          await accountDeleted(done.purge_after);
          router.replace("/welcome");
        } catch (err) {
          setFailure(messageFor(err));
        }
      })();
    }
  }, [status]); // runs its body once, as soon as the saved session is known

  const from = answer?.from ?? "/welcome";
  const keep = () => {
    const settings = config.data;
    if (!settings?.client_id) return;
    void startGoogleSignIn({
      clientId: settings.client_id, redirectUri: settings.redirect_uri ?? null, purpose: "sign-in", restore: true, from,
    });
  };
  const problem = failure ?? flow.failure;
  return (
    <Screen>
      <Title>{t.google.returnTitle}</Title>
      {problem ? (
        <>
          <Notice kind="error">{problem}</Notice>
          <Button label={t.google.back} variant="secondary" onPress={() => router.replace(from)} />
        </>
      ) : flow.scheduled ? (
        <>
          <Notice kind="info">{deletionNotice(t.account.scheduled, flow.scheduled.purgeAfter)}</Notice>
          <Button label={t.account.keep} hint={t.account.keepHint} onPress={keep} />
          <Button label={t.google.back} variant="secondary" onPress={() => router.replace(from)} />
        </>
      ) : (
        <Body>{t.google.working}</Body>
      )}
    </Screen>
  );
}

/** Someone new: Google gave the email; the age gate and the documents are the same as any sign-up. */
export function GoogleFinishScreen({ now }: { now?: () => Date }) {
  const { api, googleSignUp, signIn } = useAuth();
  const router = useRouter();
  const schema = useMemo(() => makeGoogleFinishSchema(now), [now]);
  const [failure, setFailure] = useState<string | null>(null);
  const { control, handleSubmit, formState, setValue } = useForm<GoogleFinishValues>({
    resolver: zodResolver(schema),
    defaultValues: { day: "", month: "", year: "", terms: false, privacy: false },
  });
  const documents = useDocumentVersions(() => {
    setValue("terms", false);
    setValue("privacy", false);
  });

  if (!googleSignUp) {
    // The ticket lives in memory only: a reload loses it, and Google is asked again.
    return (
      <Screen>
        <Title>{t.google.finishTitle}</Title>
        <Notice kind="info">{t.google.finishLost}</Notice>
        <Button label={t.google.restart} onPress={() => router.replace("/welcome")} />
      </Screen>
    );
  }
  const { ticket, email } = googleSignUp;
  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const session = await unwrap(
        api.POST("/v1/auth/google/complete", {
          body: { ticket, birthdate: birthdateIso(values), consents: documents.versions },
        }),
      );
      await signIn(session.token);
      router.replace("/profile");
    } catch (err) {
      setFailure(documents.adopt(err) ? t.signUp.documentsChanged : messageFor(err));
    }
  });

  return (
    <Screen>
      <Title>{t.google.finishTitle}</Title>
      <Body>{fill(t.google.finishBody, { email })}</Body>
      <BirthAndConsentFields control={control} errors={formState.errors} />
      <Body muted>{BETA_DOCUMENTS ? t.signUp.betaNotice : t.signUp.draftNotice}</Body>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Button label={t.google.submit} onPress={submit} busy={formState.isSubmitting} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  or: { alignItems: "center" },
});
