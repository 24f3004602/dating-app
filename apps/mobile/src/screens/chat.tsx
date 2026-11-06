/** A conversation with one match (F05). REST is the source of truth; the
 * realtime provider refreshes this screen when something changes. */
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "@/api/client";
import { flattenPages, type Message, useConversation, useMarkRead, useMatch, useNudgeTerms, useSendMessage } from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { nudgeFor } from "@/chat/nudge";
import { fill, t } from "@/i18n/en";
import { timeInIndia } from "@/i18n/time";
import { useRealtimeStatus } from "@/realtime/RealtimeProvider";
import { SafetyActions } from "@/screens/safety";
import { color, radius, size, space, type } from "@/theme/tokens";
import { Reveal } from "@/ui/motion";
import { Body, Button, Loading, Notice, Row, Screen, TextField, Title } from "@/ui/primitives";

const BODY_MAX = 2000;

/** A message the server hasn't confirmed yet. Retries reuse its ID (idempotent). */
type Pending = { clientId: string; body: string; failed: boolean };

type BubbleProps = { mine: boolean; body: string; meta: string; tip?: boolean; removed?: boolean; appear?: boolean };

function Bubble({ mine, body, meta, tip, removed, appear = false }: BubbleProps) {
  return (
    <Reveal appear={appear} style={mine ? styles.itemMine : styles.itemTheirs}>
    <View role="listitem" style={[styles.item, mine ? styles.itemMine : styles.itemTheirs]}>
      <View style={[styles.bubble, removed ? styles.removed : mine ? styles.mine : styles.theirs]}>
        <Text style={removed ? styles.removedText : mine ? styles.mineText : styles.theirsText}>
          {removed ? t.chat.removed : body}
        </Text>
      </View>
      <Text style={styles.meta}>{meta}</Text>
      {tip ? <Notice kind="info">{t.chat.moneyTip}</Notice> : null}
    </View>
    </Reveal>
  );
}

/** A message keeps the ID its sender's app gave it, so "sending" and "sent" are the same bubble. */
const bubbleKey = (m: Message) => m.client_message_id ?? m.id;

/**
 * Which messages are new while the conversation is open (stage 19): those slide
 * in; the history that was already there doesn't. A message keeps its client ID
 * from "sending" to "sent", so it moves in once, not twice.
 */
function useArrivals(loaded: boolean, ids: string[]) {
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null && loaded) seen.current = new Set(ids);
  useEffect(() => {
    if (seen.current) for (const id of ids) seen.current.add(id);
  });
  return (id: string) => seen.current !== null && !seen.current.has(id);
}

export function ChatScreen({ matchId }: { matchId: string }) {
  const router = useRouter();
  const match = useMatch(matchId);
  const convo = useConversation(matchId);
  const send = useSendMessage(matchId);
  const markRead = useMarkRead(matchId);
  const terms = useNudgeTerms();
  const realtime = useRealtimeStatus();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [nudging, setNudging] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const messages = useMemo(() => flattenPages(convo.data?.pages), [convo.data]);
  const confirmed = useMemo(() => new Set(messages.map((m) => m.client_message_id)), [messages]);
  const waiting = pending.filter((p) => !confirmed.has(p.clientId));
  const latest = messages.at(-1)?.n;
  const unread = match.data?.unread ?? 0;
  const { mutate: read } = markRead;
  const isNew = useArrivals(!convo.isPending, [...messages.map(bubbleKey), ...waiting.map((p) => p.clientId)]);

  // Seeing the conversation moves my read pointer (the other person isn't told).
  useEffect(() => {
    if (latest !== undefined && unread > 0) read(latest);
  }, [latest, unread, read]);

  if (match.isPending || convo.isPending) return <Loading label={t.common.loading} />;
  if (match.isError || convo.isError) {
    const error = match.error ?? convo.error;
    const gone = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        <Notice kind={gone ? "info" : "error"}>{gone ? t.chat.gone : messageFor(error)}</Notice>
      </Screen>
    );
  }
  const name = match.data.person.display_name;

  const deliver = async (item: Pending) => {
    setPending((list) => [...list.filter((p) => p.clientId !== item.clientId), { ...item, failed: false }]);
    try {
      await send.mutateAsync({ client_message_id: item.clientId, body: item.body });
    } catch (err) {
      setPending((list) => list.map((p) => (p.clientId === item.clientId ? { ...p, failed: true } : p)));
      setFailure(messageFor(err));
    }
  };

  const submit = (anyway: boolean) => {
    const body = draft.trim();
    if (!body) return;
    if (!anyway && nudgeFor(body, terms.data) === "hurtful") {
      setNudging(true);
      return;
    }
    setNudging(false);
    setFailure(null);
    setDraft("");
    void deliver({ clientId: randomUUID(), body, failed: false });
  };

  const meta = (m: Message) => fill(t.chat.meta, { who: m.from_me ? t.chat.you : name, time: timeInIndia(m.sent_at) });

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.list}
          focusable={Platform.OS === "web"}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          <Title>{name}</Title>
          <SafetyActions
            userId={match.data.person.user_id}
            name={name}
            matchId={matchId}
            onEnded={() => router.replace("/matches")}
          />
          {realtime === "offline" ? <Body muted>{t.chat.offline}</Body> : null}
          {convo.hasNextPage ? (
            <Button
              label={t.chat.earlier}
              variant="secondary"
              busy={convo.isFetchingNextPage}
              onPress={() => void convo.fetchNextPage()}
            />
          ) : null}
          {messages.length === 0 && waiting.length === 0 ? (
            <Notice kind="info">{`${fill(t.chat.empty, { name })} ${t.chat.stored}`}</Notice>
          ) : null}
          <View role="list" style={styles.messages}>
            {messages.map((m) => (
              <Bubble
                key={bubbleKey(m)}
                mine={m.from_me}
                body={m.body}
                meta={meta(m)}
                tip={m.safety_tip === "money"}
                removed={m.removed}
                appear={isNew(bubbleKey(m))}
              />
            ))}
            {waiting.map((p) => (
              <Bubble
                key={p.clientId}
                mine
                body={p.body}
                meta={p.failed ? t.chat.notSent : t.chat.sending}
                appear={isNew(p.clientId)}
              />
            ))}
          </View>
          {waiting.some((p) => p.failed) ? (
            <View style={styles.retry}>
              {failure ? <Notice kind="error">{failure}</Notice> : null}
              {waiting
                .filter((p) => p.failed)
                .map((p) => (
                  <Button key={p.clientId} label={t.chat.retry} variant="secondary" onPress={() => void deliver(p)} />
                ))}
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.composer}>
          {nudging ? (
            <View style={styles.nudge}>
              <Notice kind="info">{t.chat.nudge}</Notice>
              <Row>
                <View style={styles.grow}>
                  <Button label={t.chat.sendAnyway} variant="secondary" onPress={() => submit(true)} />
                </View>
                <View style={styles.grow}>
                  <Button label={t.chat.edit} onPress={() => setNudging(false)} />
                </View>
              </Row>
            </View>
          ) : null}
          <TextField
            label={t.chat.message}
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setNudging(false);
            }}
            maxLength={BODY_MAX}
            multiline
          />
          <Button label={t.chat.send} onPress={() => submit(false)} disabled={!draft.trim() || nudging} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  list: { padding: space.lg, gap: space.md, maxWidth: size.contentMax, width: "100%", alignSelf: "center" },
  messages: { gap: space.md },
  item: { gap: space.xs, maxWidth: "85%" },
  itemMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  itemTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md },
  mine: { backgroundColor: color.accent, borderBottomRightRadius: radius.sm / 2 },
  theirs: { backgroundColor: color.surface, borderBottomLeftRadius: radius.sm / 2 },
  mineText: { color: color.onAccent, ...type.body },
  theirsText: { color: color.text, ...type.body },
  removed: { borderWidth: 1, borderColor: color.border, backgroundColor: color.bg },
  removedText: { color: color.textMuted, ...type.body, fontStyle: "italic" },
  meta: { color: color.textMuted, ...type.caption },
  retry: { gap: space.sm },
  composer: {
    gap: space.sm,
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border,
    maxWidth: size.contentMax,
    width: "100%",
    alignSelf: "center",
  },
  nudge: { gap: space.sm },
  grow: { flex: 1 },
});
