/**
 * The plan (stage 23, D015, D094, D123): one published price, the same for everyone, read
 * from the payment provider so what's shown is what's charged. It brings Live calls after
 * the free ones, and longer calls. Easy exit: Stop renewing is one tap and a confirmation.
 *
 * Paying happens on Razorpay's own page: in the web build, and in phone builds made for
 * direct download (EXPO_PUBLIC_WEB_CHECKOUT=1). Store builds never send people to pay
 * outside the store (Apple 3.1.1, Google Play's payments policy; D094): until in-app
 * purchase exists they say the plan isn't available in this version.
 */
import { useState } from "react";
import { Linking, View } from "react-native";

import { type PlanOut, useCheckout, useLive, usePlan, useStopRenewing, useSubscription } from "@/api/live";
import { messageFor } from "@/api/messages";
import { WEB_CHECKOUT } from "@/config";
import { dateInIndia } from "@/i18n/time";
import { fill, t } from "@/i18n/en";
import { planName } from "@/screens/live";
import { space } from "@/theme/tokens";
import { Body, Button, Caption, Heading, Loading, Notice, Plate, Screen } from "@/ui/primitives";

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
  const until = mine.paid_until ? dateInIndia(mine.paid_until) : "";

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
      {plan.data.available ? <Heading>{priceLine(plan.data)}</Heading> : null}
      <Body muted>{t.plan.what}</Body>
      <View style={{ gap: space.sm }}>
        {t.plan.perks.map((perk, i) => (
          <Body key={perk}>{`${i + 1}. ${fill(perk, { minutes })}`}</Body>
        ))}
      </View>
      <Caption>{t.plan.fairness}</Caption>

      {mine.entitled ? (
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
