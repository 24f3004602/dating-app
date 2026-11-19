/**
 * The plan (stage 23, D015, D094, D123): one published price, the same for everyone, read
 * from the payment provider so what's shown is what's charged. It brings Live calls after
 * the free ones, and longer calls. Easy exit: Stop renewing is one tap and a confirmation.
 *
 * Paying happens on Razorpay's own page, or (D127) by UPI straight to the operator for a
 * pass that never renews: in the web build, and in phone builds made for direct download
 * (EXPO_PUBLIC_WEB_CHECKOUT=1). Store builds never send people to pay outside the store
 * (Apple 3.1.1, Google Play's payments policy; D094): until in-app purchase exists they
 * say the plan isn't available in this version.
 */
import { useState } from "react";
import { Image, Linking, Platform, StyleSheet, View } from "react-native";

import {
  type PlanOut,
  type SubscriptionOut,
  useCheckout,
  useLive,
  usePlan,
  usePlusPayment,
  useSendReference,
  useStartPlusPayment,
  useStopRenewing,
  useSubscription,
} from "@/api/live";
import { messageFor } from "@/api/messages";
import { DOCUMENT_LINKS, WEB_CHECKOUT } from "@/config";
import { dateForPeople, timeInIndia } from "@/i18n/time";
import { fill, t } from "@/i18n/en";
import { planName } from "@/screens/live";
import { space } from "@/theme/tokens";
import { Body, Button, Caption, ExternalLink, Heading, Loading, Notice, Plate, Screen, TextField } from "@/ui/primitives";

/** "₹299" */
export function money(amount: number, currency: string): string {
  const units = amount / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(units) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(units);
  } catch {
    return `${currency} ${units}`;
  }
}

/** "₹299 a month", "₹799 every 3 months" */
export function priceLine(plan: PlanOut): string {
  if (!plan.amount || !plan.currency || !plan.period) return "";
  const price = money(plan.amount, plan.currency);
  const period = t.plan.periods[plan.period];
  const n = plan.interval ?? 1;
  return n === 1 ? fill(t.plan.perPeriod, { price, period }) : fill(t.plan.perPeriods, { price, n, period });
}

/** "₹299 for 30 days" */
export function passLine(plan: PlanOut): string {
  if (!plan.amount || !plan.currency || !plan.days) return "";
  return fill(t.plan.passPrice, { price: money(plan.amount, plan.currency), days: plan.days });
}

/** The note the payment link fills in ("Kinaara Plus K7Q2M9PX"), read from the link itself. */
function noteOf(upiUrl: string, code: string): string {
  const raw = upiUrl.split("&tn=")[1];
  try {
    return raw ? decodeURIComponent(raw) : code;
  } catch {
    return code;
  }
}

/**
 * The pass (D127): pay by UPI (a link that opens a UPI app with everything filled in, and
 * on the web its QR code), then send the payment's 12-digit reference; an admin finds it in
 * the bank and the pass starts. Buying again adds days after the current pass.
 */
function PassSection({ plan, mine }: { plan: PlanOut; mine: SubscriptionOut }) {
  const name = planName();
  const payment = usePlusPayment(true);
  const start = useStartPlusPayment();
  const send = useSendReference();
  const [utr, setUtr] = useState("");
  const [utrError, setUtrError] = useState<string | undefined>();
  const [noApp, setNoApp] = useState(false);
  const price = money(plan.amount ?? 0, plan.currency ?? "INR");
  const days = plan.days ?? 30;
  const until = mine.paid_until ? dateForPeople(mine.paid_until) : "";

  if (payment.isPending) return <Loading label={t.common.loading} />;
  const p = payment.data ?? null;
  const active = mine.entitled ? <Notice kind="success">{fill(t.plan.passActive, { plan: name, date: until })}</Notice> : null;
  const terms = <ExternalLink label={t.plan.terms} url={DOCUMENT_LINKS.terms} />;

  if (p?.status === "open") {
    const openApp = async () => {
      try {
        await Linking.openURL(p.upi_url);
      } catch {
        setNoApp(true);
      }
    };
    const submit = () => {
      const digits = utr.replace(/\s/g, "");
      if (!/^\d{12}$/.test(digits)) {
        setUtrError(t.plan.referenceInvalid);
        return;
      }
      setUtrError(undefined);
      send.mutate({ id: p.id, utr: digits });
    };
    return (
      <>
        {active}
        <Heading>{fill(t.plan.stepsTitle, { price })}</Heading>
        <Body selectable>{fill(t.plan.step1, { price, name: p.payee_name, vpa: p.payee_vpa })}</Body>
        <Button label={t.plan.openApp} hint={t.plan.openAppHint} onPress={() => void openApp()} />
        {noApp ? <Notice kind="info">{fill(t.plan.noApp, { name: p.payee_name, vpa: p.payee_vpa })}</Notice> : null}
        {Platform.OS === "web" && p.qr ? (
          <View style={styles.qrBlock}>
            <Image
              source={{ uri: p.qr }}
              style={styles.qr}
              resizeMode="contain"
              role="img"
              aria-label={fill(t.plan.qrLabel, { price, name: p.payee_name })}
            />
            <Caption>{t.plan.scan}</Caption>
          </View>
        ) : null}
        <Body selectable>{fill(t.plan.step2, { note: noteOf(p.upi_url, p.code) })}</Body>
        <Body>{t.plan.step3}</Body>
        <TextField
          label={t.plan.reference}
          hint={t.plan.referenceHint}
          value={utr}
          onChangeText={setUtr}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={14}
          autoComplete="off"
          autoCorrect={false}
          error={utrError}
        />
        <Button label={t.plan.send} busy={send.isPending} onPress={submit} />
        {send.error ? <Notice kind="error">{messageFor(send.error)}</Notice> : null}
        <Caption>{fill(t.plan.payBy, { time: timeInIndia(p.open_until), date: dateForPeople(p.open_until) })}</Caption>
        {terms}
      </>
    );
  }

  if (p?.status === "submitted") {
    return (
      <>
        {active}
        <Notice kind="info">{fill(t.plan.checking, { utr: p.utr ?? "", plan: name })}</Notice>
        <Button label={t.plan.check} variant="secondary" busy={payment.isFetching} onPress={() => void payment.refetch()} />
      </>
    );
  }

  const confirmed = p?.status === "approved" && mine.entitled;
  return (
    <>
      {confirmed ? <Notice kind="success">{fill(t.plan.confirmed, { plan: name, date: until })}</Notice> : active}
      {p?.status === "rejected" ? (
        <Notice kind="error">{fill(t.plan.rejected[p.reject_reason ?? "other"], { utr: p.utr ?? "", price })}</Notice>
      ) : null}
      <Caption>{t.plan.passWhat}</Caption>
      <Button
        label={mine.entitled ? fill(t.plan.extend, { days, price }) : p?.status === "rejected" ? t.plan.startAgain : fill(t.plan.pay, { price })}
        variant={mine.entitled ? "secondary" : "primary"}
        busy={start.isPending}
        onPress={() => start.mutate()}
      />
      <Caption>{fill(t.plan.payHint, { plan: name })}</Caption>
      {start.error ? <Notice kind="error">{messageFor(start.error)}</Notice> : null}
      {terms}
    </>
  );
}

/** `canPay`: whether paying on the provider's page is allowed in this build (config.ts). */
export function PlanScreen({ canPay = WEB_CHECKOUT }: { canPay?: boolean } = {}) {
  const plan = usePlan();
  const sub = useSubscription();
  const live = useLive();
  const minutes = Math.round((live.data?.plan_call_seconds ?? 600) / 60);
  const checkout = useCheckout();
  const stop = useStopRenewing();
  const [opened, setOpened] = useState(false);
  const [asking, setAsking] = useState(false);
  const name = planName();

  if (!plan.data || !sub.data) {
    const error = plan.error ?? sub.error;
    return <Screen>{error ? <Notice kind="error">{messageFor(error)}</Notice> : <Loading label={t.common.loading} />}</Screen>;
  }
  const mine = sub.data;
  const until = mine.paid_until ? dateForPeople(mine.paid_until) : "";
  const isPass = plan.data.kind === "pass";

  const buy = async () => {
    try {
      const out = await checkout.mutateAsync();
      if (out.checkout_url) {
        await Linking.openURL(out.checkout_url);
        setOpened(true);
      }
    } catch {
      // the error shows below
    }
  };

  return (
    <Screen>
      <Plate heading>{name}</Plate>
      {plan.data.available ? <Heading>{isPass ? passLine(plan.data) : priceLine(plan.data)}</Heading> : null}
      <Body muted>{t.plan.what}</Body>
      <View style={{ gap: space.sm }}>
        {t.plan.perks.map((perk, i) => (
          <Body key={perk}>{`${i + 1}. ${fill(perk, { minutes })}`}</Body>
        ))}
      </View>
      <Caption>{t.plan.fairness}</Caption>

      {isPass && plan.data.available ? (
        canPay ? (
          <PassSection plan={plan.data} mine={mine} />
        ) : (
          <Notice kind="info">{fill(t.plan.notHere, { plan: name })}</Notice>
        )
      ) : mine.entitled ? (
        <>
          <Notice kind="success">{`${fill(t.plan.active, { plan: name, date: until })} ${mine.renews ? t.plan.renewing : t.plan.notRenewing}`}</Notice>
          {mine.renews && !asking ? <Button label={t.plan.cancel} variant="secondary" onPress={() => setAsking(true)} /> : null}
          {asking ? (
            <>
              <Body>{fill(t.plan.cancelAsk, { plan: name, date: until })}</Body>
              <Button label={t.plan.cancel} variant="danger" busy={stop.isPending} onPress={() => stop.mutate(undefined, { onSettled: () => setAsking(false) })} />
              <Button label={t.common.cancel} variant="secondary" onPress={() => setAsking(false)} />
            </>
          ) : null}
          {stop.isSuccess ? <Notice kind="success">{fill(t.plan.cancelled, { plan: name })}</Notice> : null}
          {stop.error ? <Notice kind="error">{messageFor(stop.error)}</Notice> : null}
        </>
      ) : !plan.data.available ? (
        <Notice kind="info">{fill(t.plan.unavailable, { plan: name })}</Notice>
      ) : !canPay ? (
        <Notice kind="info">{fill(t.plan.notHere, { plan: name })}</Notice>
      ) : (
        <>
          <Caption>{fill(t.plan.renews, { period: t.plan.periods[plan.data.period ?? "monthly"] })}</Caption>
          <Button label={fill(t.plan.subscribe, { plan: name })} hint={t.plan.subscribeHint} busy={checkout.isPending} onPress={() => void buy()} />
          <Caption>{t.plan.subscribeHint}</Caption>
          {checkout.error ? <Notice kind="error">{messageFor(checkout.error)}</Notice> : null}
          {opened ? (
            <>
              <Notice kind="info">{t.plan.waiting}</Notice>
              <Button label={t.plan.refresh} variant="secondary" busy={sub.isFetching} onPress={() => void sub.refetch()} />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrBlock: { alignItems: "flex-start", gap: space.xs },
  qr: { width: 240, height: 240 },
});
