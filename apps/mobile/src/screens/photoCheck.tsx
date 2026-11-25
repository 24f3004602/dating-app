/**
 * The blue tick (stage 29b, D164): ask for a gesture, take a selfie making it, and wait for our
 * team. The screen says plainly what the tick means (a selfie compared with the photos, not an
 * ID check) and that the selfie is deleted once we've decided.
 */
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGesture, usePhotoCheck, useSendSelfie } from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { fill, t } from "@/i18n/en";
import { timeInIndia } from "@/i18n/time";
import { color, radius, space } from "@/theme/tokens";
import { Body, Button, Caption, Heading, Loading, Notice, Screen, Title } from "@/ui/primitives";
import { VerifiedTick } from "@/ui/VerifiedTick";

export function PhotoCheckScreen() {
  const check = usePhotoCheck();
  const gesture = useGesture();
  const send = useSendSelfie();
  const [failure, setFailure] = useState<string | null>(null);

  if (check.isPending) return <Loading label={t.common.loading} />;
  if (check.isError) {
    return (
      <Screen>
        <Notice kind="error">{messageFor(check.error)}</Notice>
        <Button label={t.common.retry} variant="secondary" onPress={() => void check.refetch()} />
      </Screen>
    );
  }
  const c = check.data;

  const start = () => {
    setFailure(null);
    gesture.mutate(undefined, { onError: (err) => setFailure(messageFor(err)) });
  };
  const take = async () => {
    setFailure(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setFailure(t.photoCheck.cameraPermission);
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      cameraType: ImagePicker.CameraType.front,
      quality: 0.9,
      exif: false,
    });
    const asset = shot.canceled ? undefined : shot.assets[0];
    if (!asset) return;
    send.mutate(
      { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName ?? "selfie.jpg" },
      { onError: (err) => setFailure(messageFor(err)) },
    );
  };
  const canStart = c.state === "none" || c.state === "removed" || c.state === "rejected";

  return (
    <Screen>
      <Title>{t.photoCheck.title}</Title>
      {c.state === "verified" ? <VerifiedTick /> : null}
      <Body>{t.photoCheck.intro}</Body>
      {c.state === "verified" ? (
        <>
          <Notice kind="success">{t.photoCheck.verified}</Notice>
          <Caption>{t.photoCheck.verifiedNote}</Caption>
        </>
      ) : null}
      {c.state === "pending" ? <Notice kind="info">{t.photoCheck.pending}</Notice> : null}
      {c.state === "removed" ? <Notice kind="info">{t.photoCheck.removed}</Notice> : null}
      {c.state === "rejected" && c.reason ? (
        <Notice kind="info">{fill(t.photoCheck.rejected, { reason: t.photoCheck.reasons[c.reason] })}</Notice>
      ) : null}
      {c.state === "awaiting" && c.gesture && c.expires_at ? (
        <View style={styles.gesture}>
          <Body>{t.photoCheck.make}</Body>
          <Heading>{t.photoCheck.gestures[c.gesture]}</Heading>
          <Caption>{fill(t.photoCheck.until, { time: timeInIndia(c.expires_at) })}</Caption>
          <Button label={t.photoCheck.take} onPress={() => void take()} busy={send.isPending} />
        </View>
      ) : null}
      {canStart ? (
        <>
          <Button label={t.photoCheck.start} onPress={start} busy={gesture.isPending} />
          <Caption>{t.photoCheck.startHint}</Caption>
        </>
      ) : null}
      {failure ? <Notice kind="error">{failure}</Notice> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gesture: { gap: space.sm, padding: space.md, borderRadius: radius.plate, backgroundColor: color.surface },
});
