/** My profile, profile editing, photos and privacy. */
import { zodResolver } from "@hookform/resolvers/zod";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Image, StyleSheet, View } from "react-native";

import {
  absoluteUrl,
  type MyProfile,
  useAreas,
  useDeletePhoto,
  useMe,
  useMyProfile,
  usePhotos,
  usePrompts,
  useReorderPhotos,
  useSavePrivacy,
  useSaveProfile,
  useUploadPhoto,
} from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
import { API_URL } from "@/config";
import { fill, t } from "@/i18n/en";
import { color, radius, size, space } from "@/theme/tokens";
import { FormField } from "@/ui/FormField";
import { Body, Button, Checkbox, ChoiceGroup, Heading, Loading, Notice, Row, Screen, Title } from "@/ui/primitives";
import { GENDERS, INTENTS, type ProfileValues, profileSchema } from "@/validation/schemas";

const genderOptions = GENDERS.map((g) => ({ value: g, label: t.gender[g] }));
const intentOptions = INTENTS.map((i) => ({ value: i, label: t.intent[i] }));

function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <Notice kind="error">{messageFor(error)}</Notice>
      <Button label={t.common.retry} variant="secondary" onPress={retry} />
    </>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const { signOut, signOutEverywhere } = useAuth();
  const profile = useMyProfile();
  const me = useMe();

  if (profile.isPending) return <Loading label={t.common.loading} />;
  if (profile.isError) {
    return (
      <Screen>
        <QueryError error={profile.error} retry={() => void profile.refetch()} />
      </Screen>
    );
  }
  const p = profile.data;
  const labels = me.data
    ? [t.profile.ageDeclared, me.data.verification.email === "verified" ? t.profile.emailVerified : null, t.profile.identityNotChecked]
    : [];

  return (
    <Screen>
      <Title>{t.profile.title}</Title>
      {p === null ? (
        <>
          <Heading>{t.profile.emptyTitle}</Heading>
          <Body>{t.profile.emptyBody}</Body>
          <Button label={t.profile.create} onPress={() => router.push("/profile/edit")} />
        </>
      ) : (
        <ProfileSummary profile={p} />
      )}
      {labels.length ? <Body muted>{labels.filter(Boolean).join(" · ")}</Body> : null}
      {p ? (
        <>
          <Button label={t.discover.open} onPress={() => router.push("/discover")} />
          <Button label={t.likes.open} variant="secondary" onPress={() => router.push("/likes")} />
          <Button label={t.matches.open} variant="secondary" onPress={() => router.push("/matches")} />
          <Button label={t.preferences.open} variant="secondary" onPress={() => router.push("/preferences")} />
          <Button label={t.profile.edit} variant="secondary" onPress={() => router.push("/profile/edit")} />
          <Button label={t.profile.photos} variant="secondary" onPress={() => router.push("/photos")} />
          <Button label={t.profile.privacy} variant="secondary" onPress={() => router.push("/privacy")} />
          <Button label={t.safety.open} variant="secondary" onPress={() => router.push("/safety")} />
        </>
      ) : null}
      <Button label={t.profile.signOut} variant="secondary" onPress={() => void signOut()} />
      <Button label={t.profile.signOutAll} variant="danger" onPress={() => void signOutEverywhere()} />
    </Screen>
  );
}

function ProfileSummary({ profile }: { profile: MyProfile }) {
  const cover = profile.photos[0];
  return (
    <View style={styles.summary}>
      {cover ? (
        <Image source={{ uri: absoluteUrl(API_URL, cover.urls.small) }} style={styles.thumb} role="img" aria-label={t.photos.coverAlt} />
      ) : null}
      <Heading>{`${profile.display_name}, ${profile.age}`}</Heading>
      <Body>{t.intent[profile.intent]}</Body>
      <Body muted>{`${profile.area.name}, ${profile.area.city}`}</Body>
      {profile.readiness.ready ? (
        <Notice kind="success">{t.profile.ready}</Notice>
      ) : (
        <Notice kind="info">{`${t.profile.notReady}. ${fill(t.profile.needPhotos, { n: profile.readiness.approved_photos_needed })}`}</Notice>
      )}
    </View>
  );
}

function toFormValues(p: MyProfile | null | undefined): ProfileValues {
  return {
    displayName: p?.display_name ?? "",
    gender: p?.gender ?? (undefined as unknown as ProfileValues["gender"]),
    interestedIn: p?.interested_in ?? [],
    intent: p?.intent ?? (undefined as unknown as ProfileValues["intent"]),
    bio: p?.bio ?? "",
    areaId: p?.area.id ?? "",
    prompts: p?.prompts.map((x) => ({ key: x.key, answer: x.answer })) ?? [],
  };
}

export function EditProfileScreen() {
  const router = useRouter();
  const profile = useMyProfile();
  const areas = useAreas();
  const prompts = usePrompts();
  const save = useSaveProfile();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: toFormValues(null) });
  const promptFields = useFieldArray({ control: form.control, name: "prompts" });
  const { reset } = form;

  useEffect(() => {
    if (profile.data !== undefined) reset(toFormValues(profile.data));
  }, [profile.data, reset]);

  if (profile.isPending || areas.isPending || prompts.isPending) return <Loading label={t.common.loading} />;
  const failed = profile.error ?? areas.error ?? prompts.error;
  if (failed) {
    return (
      <Screen>
        <QueryError error={failed} retry={() => void Promise.all([profile.refetch(), areas.refetch(), prompts.refetch()])} />
      </Screen>
    );
  }

  const e = form.formState.errors;
  const chosenKeys = form.watch("prompts").map((p) => p.key);
  const unused = (prompts.data ?? []).filter((p) => !chosenKeys.includes(p.key));
  const promptText = new Map((prompts.data ?? []).map((p) => [p.key, p.text]));

  const submit = form.handleSubmit(async (v) => {
    setFailure(null);
    try {
      await save.mutateAsync({
        display_name: v.displayName,
        gender: v.gender,
        interested_in: v.interestedIn,
        intent: v.intent,
        bio: v.bio.trim() ? v.bio : null,
        area_id: v.areaId,
        prompts: v.prompts.map((p) => ({ key: p.key, answer: p.answer })),
      });
      router.back();
    } catch (err) {
      setFailure(messageFor(err));
    }
  });

  return (
    <Screen>
      <Title>{profile.data ? t.profile.edit : t.profile.create}</Title>
      <FormField control={form.control} name="displayName" label={t.editProfile.name} hint={t.editProfile.nameHint}
        error={e.displayName?.message} autoComplete="given-name" />
      <Controller control={form.control} name="gender" render={({ field }) => (
        <ChoiceGroup label={t.editProfile.gender} options={genderOptions} value={field.value} onChange={field.onChange} error={e.gender?.message} />
      )} />
      <Controller control={form.control} name="interestedIn" render={({ field }) => (
        <ChoiceGroup multiple label={t.editProfile.interestedIn} options={genderOptions} value={field.value} onChange={field.onChange} error={e.interestedIn?.message} />
      )} />
      <Controller control={form.control} name="intent" render={({ field }) => (
        <ChoiceGroup label={t.editProfile.intent} options={intentOptions} value={field.value} onChange={field.onChange} error={e.intent?.message} />
      )} />
      <FormField control={form.control} name="bio" label={t.editProfile.bio} hint={t.editProfile.bioHint} error={e.bio?.message}
        multiline numberOfLines={4} maxLength={500} />
      <Controller control={form.control} name="areaId" render={({ field }) => (
        <ChoiceGroup label={`${t.editProfile.area}. ${t.editProfile.areaHint}`} value={field.value} onChange={field.onChange} error={e.areaId?.message}
          options={(areas.data ?? []).map((a) => ({ value: a.id, label: `${a.name}, ${a.city}` }))} />
      )} />
      <Heading>{t.editProfile.prompts}</Heading>
      {promptFields.fields.map((f, index) => (
        <View key={f.id} style={styles.prompt}>
          <Body>{promptText.get(form.watch(`prompts.${index}.key`)) ?? ""}</Body>
          <FormField control={form.control} name={`prompts.${index}.answer`} label={t.editProfile.answer}
            error={e.prompts?.[index]?.answer?.message} multiline maxLength={200} />
          <Button label={t.editProfile.removePrompt} variant="secondary" onPress={() => promptFields.remove(index)} />
        </View>
      ))}
      {promptFields.fields.length < 3 ? (
        <ChoiceGroup label={t.editProfile.addPrompt} value={undefined} onChange={(key) => promptFields.append({ key, answer: "" })}
          options={unused.map((p) => ({ value: p.key, label: p.text }))} />
      ) : null}
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Button label={t.common.save} onPress={submit} busy={form.formState.isSubmitting} />
    </Screen>
  );
}

export function PhotosScreen() {
  const photos = usePhotos();
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const reorder = useReorderPhotos();
  const [failure, setFailure] = useState<string | null>(null);

  if (photos.isPending) return <Loading label={t.common.loading} />;
  if (photos.isError) {
    return (
      <Screen>
        <QueryError error={photos.error} retry={() => void photos.refetch()} />
      </Screen>
    );
  }
  const list = photos.data;

  const add = async () => {
    setFailure(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFailure(t.photos.permission);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    upload.mutate(
      { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName },
      { onError: (err) => setFailure(messageFor(err)) },
    );
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(index + by, 0, moved);
    reorder.mutate(ids, { onError: (err) => setFailure(messageFor(err)) });
  };

  return (
    <Screen>
      <Title>{t.photos.title}</Title>
      {list.length === 0 ? <Body>{t.photos.empty}</Body> : null}
      {list.map((photo, index) => (
        <View key={photo.id} style={styles.photoRow}>
          <Image source={{ uri: absoluteUrl(API_URL, photo.urls.small) }} style={styles.thumb}
            role="img" aria-label={fill(t.photos.alt, { n: index + 1, total: list.length })} />
          <View style={styles.photoActions}>
            <Body muted>{t.photos[photo.moderation_state]}</Body>
            <Row>
              <Button label={t.photos.moveUp} variant="secondary" disabled={index === 0 || reorder.isPending} onPress={() => move(index, -1)} />
              <Button label={t.photos.moveDown} variant="secondary" disabled={index === list.length - 1 || reorder.isPending} onPress={() => move(index, 1)} />
              <Button label={t.photos.remove} variant="danger" disabled={remove.isPending}
                onPress={() => remove.mutate(photo.id, { onError: (err) => setFailure(messageFor(err)) })} />
            </Row>
          </View>
        </View>
      ))}
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      {list.length < 6 ? (
        <Button label={t.photos.add} onPress={() => void add()} busy={upload.isPending} />
      ) : (
        <Body muted>{t.photos.limit}</Body>
      )}
    </Screen>
  );
}

export function PrivacyScreen() {
  const profile = useMyProfile();
  const save = useSavePrivacy();
  const [failure, setFailure] = useState<string | null>(null);

  if (profile.isPending) return <Loading label={t.common.loading} />;
  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <QueryError error={profile.error} retry={() => void profile.refetch()} />
      </Screen>
    );
  }
  const p = profile.data;
  const update = (body: { visibility?: "everyone" | "liked_only"; discovery_paused?: boolean }) =>
    save.mutate(body, { onError: (err) => setFailure(messageFor(err)) });

  return (
    <Screen>
      <Title>{t.privacy.title}</Title>
      <ChoiceGroup label={t.privacy.visibility} value={p.visibility} onChange={(v) => update({ visibility: v })}
        options={[{ value: "everyone", label: t.privacy.everyone }, { value: "liked_only", label: t.privacy.likedOnly }]} />
      <Checkbox label={t.privacy.pause} checked={p.discovery_paused} onChange={(v) => update({ discovery_paused: v })} />
      <Body muted>{t.privacy.pauseHint}</Body>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: space.sm },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.md, backgroundColor: color.surfaceAlt },
  prompt: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceAlt },
  photoRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  photoActions: { flex: 1, gap: space.sm },
});
