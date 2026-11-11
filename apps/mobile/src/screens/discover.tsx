/** Today's introductions, a person's profile, and discovery preferences. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { absoluteUrl, type Card as DailyCard, type Person, usePerson, usePreferences, useSavePreferences, useToday } from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { API_URL } from "@/config";
import { fill, t } from "@/i18n/en";
import { timeInIndia } from "@/i18n/time";
import { color, radius, space } from "@/theme/tokens";
import { DecisionBar } from "@/screens/matching";
import { SafetyActions } from "@/screens/safety";
import { FormField } from "@/ui/FormField";
import { Reveal, staggered } from "@/ui/motion";
import { Body, Button, Card, ChoiceGroup, Loading, Notice, Photo, Plate, Screen, Stack, Thumb, Title } from "@/ui/primitives";
import { Rings } from "@/ui/Rings";

function cardLabel(c: DailyCard): string {
  return fill(t.discover.card, {
    name: c.display_name,
    age: c.age,
    intent: t.intent[c.intent],
    area: c.area.name,
    distance: t.distance[c.distance],
  });
}

export function DiscoverScreen() {
  const router = useRouter();
  const today = useToday();

  if (today.isPending) return <Loading label={t.common.loading} />;
  if (today.isError) {
    const code = today.error instanceof ApiError ? today.error.code : null;
    if (code === "profile_incomplete") {
      return (
        <Screen>
          <Title>{t.discover.incompleteTitle}</Title>
          <Body>{t.discover.incomplete}</Body>
          <Button label={t.discover.toPhotos} onPress={() => router.push("/photos")} />
        </Screen>
      );
    }
    if (code === "discovery_paused") {
      return (
        <Screen>
          <Title>{t.discover.pausedTitle}</Title>
          <Body>{t.discover.paused}</Body>
          <Button label={t.discover.toPrivacy} onPress={() => router.push("/privacy")} />
        </Screen>
      );
    }
    return (
      <Screen>
        <Notice kind="error">{messageFor(today.error)}</Notice>
        <Button label={t.common.retry} variant="secondary" onPress={() => void today.refetch()} />
      </Screen>
    );
  }

  const { cards, next_set_at } = today.data;
  return (
    <Screen>
      <Title>{t.discover.title}</Title>
      {cards.length === 0 ? (
        <>
          {/* The day's quiet moment: the rings breathe twice, then rest (stage 19). */}
          <Rings mode="breathe" />
          <Body>{fill(t.discover.empty, { time: timeInIndia(next_set_at) })}</Body>
        </>
      ) : null}
      {cards.map((c, i) => (
        <Reveal key={c.user_id} delay={staggered(i)}>
          <Card label={`${t.discover.view}: ${cardLabel(c)}`} onPress={() => router.push(`/person/${c.user_id}`)}>
            {c.photos[0] ? <Thumb portrait uri={absoluteUrl(API_URL, c.photos[0].urls.small)} /> : null}
            <Stack>
              <Plate>{`${c.display_name}, ${c.age}`}</Plate>
              <Body>{t.intent[c.intent]}</Body>
              <Body muted>{`${c.area.name}, ${t.distance[c.distance]}`}</Body>
            </Stack>
          </Card>
        </Reveal>
      ))}
      {cards.length > 0 ? <EndOfLine>{fill(t.discover.end, { time: timeInIndia(next_set_at) })}</EndOfLine> : null}
    </Screen>
  );
}

/** The set is finite (fewer, better): it ends like a line, at a last stop that says when the next set arrives. */
function EndOfLine({ children }: { children: string }) {
  return (
    <View style={styles.end}>
      <View style={styles.terminus} aria-hidden />
      <Body muted>{children}</Body>
    </View>
  );
}

export function PersonScreen({ id }: { id: string }) {
  const person = usePerson(id);
  if (person.isPending) return <Loading label={t.common.loading} />;
  if (person.isError) {
    const gone = person.error instanceof ApiError && person.error.status === 404;
    return (
      <Screen>
        <Notice kind={gone ? "info" : "error"}>{gone ? t.person.gone : messageFor(person.error)}</Notice>
      </Screen>
    );
  }
  return <PersonView person={person.data} />;
}

function PersonView({ person }: { person: Person }) {
  const router = useRouter();
  return (
    <Screen>
      <DecisionBar targetId={person.user_id} />
      <Title>{`${person.display_name}, ${person.age}`}</Title>
      <Body>{t.intent[person.intent]}</Body>
      <Body muted>{`${person.area.name}, ${person.area.city}`}</Body>
      {person.photos.map((p, i) => (
        <Photo
          key={p.id}
          uri={absoluteUrl(API_URL, p.urls.large)}
          style={styles.photo}
          label={fill(t.person.photo, { n: i + 1, total: person.photos.length, name: person.display_name })}
        />
      ))}
      {person.bio ? <Body>{person.bio}</Body> : null}
      {person.prompts.map((p) => (
        <View key={p.key} style={styles.prompt}>
          <Body muted>{p.text}</Body>
          <Body>{p.answer}</Body>
        </View>
      ))}
      <SafetyActions userId={person.user_id} name={person.display_name} onEnded={() => router.back()} />
    </Screen>
  );
}

const ageField = z
  .string()
  .trim()
  .regex(/^\d{2}$/, { error: t.preferences.ageRange })
  .refine((v) => Number(v) >= 18 && Number(v) <= 99, { error: t.preferences.ageRange });
const prefsSchema = z
  .object({ ageMin: ageField, ageMax: ageField, distance: z.enum(["any", "5", "15", "50"]) })
  .refine((v) => Number(v.ageMin) <= Number(v.ageMax), { path: ["ageMax"], error: t.preferences.ageOrder });
type PrefsValues = z.input<typeof prefsSchema>;

export function PreferencesScreen() {
  const prefs = usePreferences();
  const save = useSavePreferences();
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<PrefsValues>({
    resolver: zodResolver(prefsSchema),
    defaultValues: { ageMin: "18", ageMax: "99", distance: "any" },
  });
  const { reset } = form;
  useEffect(() => {
    if (prefs.data) {
      reset({
        ageMin: String(prefs.data.age_min),
        ageMax: String(prefs.data.age_max),
        distance: prefs.data.max_distance_km === null ? "any" : (String(prefs.data.max_distance_km) as PrefsValues["distance"]),
      });
    }
  }, [prefs.data, reset]);

  if (prefs.isPending) return <Loading label={t.common.loading} />;
  if (prefs.isError) {
    return (
      <Screen>
        <Notice kind="error">{messageFor(prefs.error)}</Notice>
        <Button label={t.common.retry} variant="secondary" onPress={() => void prefs.refetch()} />
      </Screen>
    );
  }

  const submit = form.handleSubmit(async (v) => {
    setFailure(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        age_min: Number(v.ageMin),
        age_max: Number(v.ageMax),
        max_distance_km: v.distance === "any" ? null : (Number(v.distance) as 5 | 15 | 50),
      });
      setSaved(true);
    } catch (err) {
      setFailure(messageFor(err));
    }
  });
  const e = form.formState.errors;

  return (
    <Screen>
      <Title>{t.preferences.title}</Title>
      <Body muted>{t.preferences.note}</Body>
      <FormField control={form.control} name="ageMin" label={t.preferences.ageMin} error={e.ageMin?.message}
        keyboardType="number-pad" inputMode="numeric" maxLength={2} />
      <FormField control={form.control} name="ageMax" label={t.preferences.ageMax} error={e.ageMax?.message}
        keyboardType="number-pad" inputMode="numeric" maxLength={2} />
      <Controller control={form.control} name="distance" render={({ field }) => (
        <ChoiceGroup label={t.preferences.distance} value={field.value} onChange={field.onChange}
          options={[
            { value: "5", label: fill(t.preferences.within, { km: 5 }) },
            { value: "15", label: fill(t.preferences.within, { km: 15 }) },
            { value: "50", label: fill(t.preferences.within, { km: 50 }) },
            { value: "any", label: t.preferences.any },
          ]} />
      )} />
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      {saved ? <Notice kind="success">{t.preferences.saved}</Notice> : null}
      <Button label={t.common.save} onPress={submit} busy={form.formState.isSubmitting} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { aspectRatio: 4 / 5 },
  prompt: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface },
  end: { flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.sm },
  // The same stop as the bottom bar's, filled: the last one on today's line.
  terminus: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: color.sign, backgroundColor: color.sign },
});
