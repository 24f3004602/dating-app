/** Block, unmatch and report (F06), the report form, and the Safety screen
 * (people I've blocked, my reports and their status). */
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  flattenPages,
  type ReportBody,
  useBlock,
  useBlocks,
  useConversation,
  useMyReports,
  useReport,
  useUnblock,
  useUnmatch,
} from "@/api/hooks";
import { messageFor } from "@/api/messages";
import { fill, t } from "@/i18n/en";
import { space } from "@/theme/tokens";
import { Body, Button, Checkbox, ChoiceGroup, Heading, Loading, Notice, Row, Screen, TextField, Title } from "@/ui/primitives";

type Reason = ReportBody["reason"];
const REASONS = Object.keys(t.report.reasons) as Reason[];

export function reportHref(userId: string, name: string, matchId?: string): string {
  const query = `name=${encodeURIComponent(name)}${matchId ? `&match=${encodeURIComponent(matchId)}` : ""}`;
  return `/report/${userId}?${query}`;
}

/** Unmatch (in a match), Block and Report. The two that end things ask first. */
export function SafetyActions({ userId, name, matchId, onEnded }: { userId: string; name: string; matchId?: string; onEnded: () => void }) {
  const router = useRouter();
  const block = useBlock();
  const unmatch = useUnmatch();
  const [confirming, setConfirming] = useState<"unmatch" | "block" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async (kind: "unmatch" | "block") => {
    setFailure(null);
    try {
      if (kind === "unmatch" && matchId) await unmatch.mutateAsync(matchId);
      else await block.mutateAsync(userId);
      setConfirming(null);
      onEnded();
    } catch (err) {
      setFailure(messageFor(err));
    }
  };

  if (confirming) {
    return (
      <View style={styles.box}>
        <Notice kind="info">{confirming === "unmatch" ? t.chat.confirmUnmatch : fill(t.chat.confirmBlock, { name })}</Notice>
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <Row>
          <View style={styles.grow}>
            <Button
              label={confirming === "unmatch" ? t.chat.unmatch : t.chat.block}
              variant="danger"
              busy={block.isPending || unmatch.isPending}
              onPress={() => void run(confirming)}
            />
          </View>
          <View style={styles.grow}>
            <Button label={t.chat.keep} variant="secondary" onPress={() => setConfirming(null)} />
          </View>
        </Row>
      </View>
    );
  }
  return (
    <Row>
      {matchId ? (
        <View style={styles.grow}>
          <Button label={t.chat.unmatch} variant="secondary" onPress={() => setConfirming("unmatch")} />
        </View>
      ) : null}
      <View style={styles.grow}>
        <Button label={t.chat.block} variant="secondary" onPress={() => setConfirming("block")} />
      </View>
      <View style={styles.grow}>
        <Button label={t.chat.report} variant="secondary" onPress={() => router.push(reportHref(userId, name, matchId))} />
      </View>
    </Row>
  );
}

export function ReportScreen({ subjectId, name, matchId }: { subjectId: string; name: string; matchId?: string }) {
  const router = useRouter();
  const send = useReport();
  const convo = useConversation(matchId ?? "", { enabled: !!matchId });
  const [reason, setReason] = useState<Reason | undefined>(undefined);
  const [about, setAbout] = useState("profile");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Their latest messages to me, newest first, as candidates for the report.
  const theirs = flattenPages(convo.data?.pages)
    .filter((m) => !m.from_me && !m.removed)
    .slice(-5)
    .reverse();

  if (sent) {
    return (
      <Screen>
        <Notice kind="success">{t.report.sent}</Notice>
        <Button label={t.report.toSafety} onPress={() => router.replace("/safety")} />
      </Screen>
    );
  }

  const submit = async () => {
    setFailure(null);
    if (!reason) {
      setReasonError(t.report.chooseReason);
      return;
    }
    const text = details.trim();
    try {
      await send.mutateAsync({
        subject_id: subjectId,
        reason,
        block: alsoBlock,
        ...(text ? { details: text } : {}),
        ...(about !== "profile" ? { message_id: about } : {}),
      });
      setSent(true);
    } catch (err) {
      setFailure(messageFor(err));
    }
  };

  return (
    <Screen>
      <Title>{fill(t.report.title, { name })}</Title>
      <Body muted>{fill(t.report.intro, { name })}</Body>
      <ChoiceGroup
        label={t.report.reason}
        value={reason}
        onChange={(v) => {
          setReason(v);
          setReasonError(undefined);
        }}
        options={REASONS.map((r) => ({ value: r, label: t.report.reasons[r] }))}
        error={reasonError}
      />
      {theirs.length > 0 ? (
        <ChoiceGroup
          label={t.report.about}
          value={about}
          onChange={setAbout}
          options={[
            { value: "profile", label: t.report.profile },
            ...theirs.map((m) => ({ value: m.id, label: fill(t.report.message, { text: m.body.slice(0, 80) }) })),
          ]}
        />
      ) : null}
      <TextField label={t.report.details} hint={t.report.detailsHint} value={details} onChangeText={setDetails} maxLength={1000} multiline />
      <Checkbox label={fill(t.report.alsoBlock, { name })} checked={alsoBlock} onChange={setAlsoBlock} />
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Button label={t.report.send} onPress={() => void submit()} busy={send.isPending} />
    </Screen>
  );
}

export function SafetyScreen() {
  const blocks = useBlocks();
  const reports = useMyReports();
  const unblock = useUnblock();
  if (blocks.isPending || reports.isPending) return <Loading label={t.common.loading} />;
  if (blocks.isError || reports.isError) {
    return (
      <Screen>
        <Notice kind="error">{messageFor(blocks.error ?? reports.error)}</Notice>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{t.safety.title}</Title>
      <Heading>{t.safety.blocked}</Heading>
      {blocks.data.length === 0 ? <Body muted>{t.safety.noBlocked}</Body> : <Body muted>{t.safety.unblockHint}</Body>}
      {blocks.data.map((b) => {
        const name = b.display_name ?? t.safety.left;
        return (
          <View key={b.user_id} style={styles.item}>
            <Body>{name}</Body>
            <Button
              label={`${t.safety.unblock} ${name}`}
              variant="secondary"
              busy={unblock.isPending && unblock.variables === b.user_id}
              onPress={() => unblock.mutate(b.user_id)}
            />
          </View>
        );
      })}
      <Heading>{t.safety.reports}</Heading>
      {reports.data.length === 0 ? <Body muted>{t.safety.noReports}</Body> : null}
      {reports.data.map((r) => (
        <Body key={r.id}>
          {fill(t.safety.reportLine, {
            name: r.subject_name ?? t.safety.left,
            reason: t.report.reasons[r.reason],
            status: t.safety.status[r.status],
          })}
        </Body>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  grow: { flex: 1 },
  item: { gap: space.sm },
});
