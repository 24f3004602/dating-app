/**
 * Notices from the team (stage 16; stage 28f, D159): fixed wording per kind, never free text. New
 * versions of the terms and privacy notice, and the reminder of the rules India's IT Rules ask for
 * every three months, link to the documents themselves. Unread notices also show at the top of
 * Today, so they reach members instead of waiting in Safety.
 */
import { StyleSheet, View } from "react-native";

import { type Notice as TeamNotice, useMarkNoticeRead, useNotices } from "@/api/hooks";
import { DOCUMENT_LINKS } from "@/config";
import { t } from "@/i18n/en";
import { dateInIndia } from "@/i18n/time";
import { space } from "@/theme/tokens";
import { Button, ExternalLink, Heading, Notice } from "@/ui/primitives";

/** One notice: its words and date, the documents where it's about them, and a way to mark it read. */
export function NoticeItem({ notice, readLabel }: { notice: TeamNotice; readLabel: string }) {
  const markRead = useMarkNoticeRead();
  return (
    <View style={styles.item}>
      <Notice kind="info">{`${notice.read ? "" : `${t.notices.unread}: `}${t.notices[notice.kind]} (${dateInIndia(notice.created_at)})`}</Notice>
      {notice.kind === "new_documents" || notice.kind === "rules_reminder" ? (
        <ExternalLink label={t.signUp.readTerms} url={DOCUMENT_LINKS.terms} />
      ) : null}
      {notice.kind === "new_documents" ? <ExternalLink label={t.signUp.readPrivacy} url={DOCUMENT_LINKS.privacy} /> : null}
      {notice.read ? null : (
        <Button label={readLabel} variant="secondary" busy={markRead.isPending} onPress={() => markRead.mutate(notice.id)} />
      )}
    </View>
  );
}

/** Every notice, newest first (Safety). */
export function NoticeList() {
  const notices = useNotices();
  if (!notices.data || notices.data.length === 0) return null;
  return (
    <>
      <Heading>{t.notices.title}</Heading>
      {notices.data.map((n) => (
        <NoticeItem key={n.id} notice={n} readLabel={t.notices.markRead} />
      ))}
    </>
  );
}

/** The unread ones, at the top of Today: gone once each is marked read. */
export function UnreadNotices() {
  const notices = useNotices();
  const unread = notices.data?.filter((n) => !n.read) ?? [];
  if (unread.length === 0) return null;
  return (
    <View style={styles.unread}>
      <Heading>{t.notices.title}</Heading>
      {unread.map((n) => (
        <NoticeItem key={n.id} notice={n} readLabel={t.notices.gotIt} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.sm },
  unread: { gap: space.md },
});
