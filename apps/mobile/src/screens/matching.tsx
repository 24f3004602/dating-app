/** Like or pass on a person, likes received, and matches. */
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { absoluteUrl, type Decision, type MatchItem, useDecide, useLikesReceived, useMatches } from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { API_URL } from "@/config";
import { fill, t } from "@/i18n/en";
import { dateInIndia } from "@/i18n/time";
import { color, radius, size, space } from "@/theme/tokens";
import { Body, Button, Heading, Loading, Notice, Row, Screen, TextField, Title } from "@/ui/primitives";

/** Shown on another member's profile. Decisions are final (no undo). */
export function DecisionBar({ targetId }: { targetId: string }) {
  const router = useRouter();
  const decide = useDecide();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Decision | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const send = (kind: "like" | "pass") => {
    setFailure(null);
    const comment = note.trim();
    decide.mutate(
      { target_id: targetId, kind, ...(kind === "like" && comment ? { comment } : {}) },
      { onSuccess: setResult, onError: (err) => setFailure(messageFor(err)) },
    );
  };

  if (result) {
    if (result.match) {
      return (
        <View style={styles.bar}>
          <Notice kind="success">{t.decide.match}</Notice>
          <Button label={t.decide.toMatches} onPress={() => router.push("/matches")} />
        </View>
      );
    }
    return (
      <Notice kind="info">
        {result.kind === "like" ? fill(t.decide.liked, { n: result.likes_left_today }) : t.decide.passed}
      </Notice>
    );
  }

  return (
    <View style={styles.bar}>
      <TextField label={t.decide.note} hint={t.decide.noteHint} value={note} onChangeText={setNote} maxLength={150} multiline />
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Row>
        <View style={styles.grow}>
          <Button label={t.decide.like} onPress={() => send("like")} busy={decide.isPending} />
        </View>
        <View style={styles.grow}>
          <Button label={t.decide.pass} variant="secondary" onPress={() => send("pass")} disabled={decide.isPending} />
        </View>
      </Row>
    </View>
  );
}

export function LikesScreen() {
  const router = useRouter();
  const likes = useLikesReceived();
  if (likes.isPending) return <Loading label={t.common.loading} />;
  if (likes.isError) {
    return (
      <Screen>
        <Notice kind="error">{messageFor(likes.error)}</Notice>
        <Button label={t.common.retry} variant="secondary" onPress={() => void likes.refetch()} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{t.likes.title}</Title>
      {likes.data.length === 0 ? <Body>{t.likes.empty}</Body> : null}
      {likes.data.map((like) => (
        <Pressable
          key={like.person.user_id}
          role="button"
          aria-label={`${t.discover.view}: ${like.person.display_name}, ${like.person.age}`}
          onPress={() => router.push(`/person/${like.person.user_id}`)}
          style={styles.item}
        >
          {like.person.photos[0] ? (
            <Image source={{ uri: absoluteUrl(API_URL, like.person.photos[0].urls.small) }} style={styles.thumb} aria-hidden />
          ) : null}
          <View style={styles.grow}>
            <Heading>{`${like.person.display_name}, ${like.person.age}`}</Heading>
            {like.about?.prompt_text ? <Body muted>{like.about.prompt_text}</Body> : null}
            {like.comment ? <Body>{fill(t.likes.note, { note: like.comment })}</Body> : null}
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

function preview(m: MatchItem): string | null {
  if (!m.last_message) return null;
  return m.last_message.from_me ? fill(t.matches.lastMine, { text: m.last_message.preview }) : m.last_message.preview;
}

export function MatchesScreen() {
  const router = useRouter();
  const matches = useMatches();
  if (matches.isPending) return <Loading label={t.common.loading} />;
  if (matches.isError) {
    return (
      <Screen>
        <Notice kind="error">{messageFor(matches.error)}</Notice>
        <Button label={t.common.retry} variant="secondary" onPress={() => void matches.refetch()} />
      </Screen>
    );
  }
  const waiting = matches.data.filter((m) => m.your_turn).length;
  return (
    <Screen>
      <Title>{t.matches.title}</Title>
      {matches.data.length === 0 ? <Body>{t.matches.empty}</Body> : null}
      {waiting > 0 ? (
        <Notice kind="info">{`${fill(t.matches.waiting, { n: waiting })}. ${t.matches.waitingHint}`}</Notice>
      ) : null}
      {matches.data.map((m) => {
        const status = [
          m.unread > 0 ? fill(t.matches.unread, { n: m.unread }) : null,
          m.your_turn ? t.matches.yourTurn : null,
        ].filter(Boolean);
        const text = preview(m);
        return (
          <Pressable
            key={m.id}
            role="button"
            aria-label={[fill(t.matches.chatWith, { name: `${m.person.display_name}, ${m.person.age}` }), ...status].join(". ")}
            onPress={() => router.push(`/chat/${m.id}`)}
            style={styles.item}
          >
            {m.person.photo ? (
              <Image source={{ uri: absoluteUrl(API_URL, m.person.photo.urls.small) }} style={styles.thumb} aria-hidden />
            ) : null}
            <View style={styles.grow}>
              <Heading>{`${m.person.display_name}, ${m.person.age}`}</Heading>
              {text ? <Body>{text}</Body> : <Body muted>{fill(t.matches.since, { date: dateInIndia(m.matched_at) })}</Body>}
              {status.length > 0 ? <Body muted>{status.join(" · ")}</Body> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { gap: space.md },
  grow: { flex: 1, gap: space.xs },
  item: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.md, backgroundColor: color.surfaceAlt },
});
