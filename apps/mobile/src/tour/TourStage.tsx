/**
 * The app tour's card (D136), drawn over the place it describes, between the sign band and
 * the line bar. The place shows through the sheet's graphite scrim and can't be pressed or
 * reached by keyboard or screen reader while the card is up; the bar stays live, so a tap on
 * a stop takes the tour there. The card is the Interchange's sheet: white and square under
 * a graphite rule, the stop's name on a sign plate, the tour's progress as stops on a line.
 */
import { type ComponentRef, type ReactNode, useEffect, useRef } from "react";
import { AccessibilityInfo, type HostInstance, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { fill, t } from "@/i18n/en";
import { color, motion, scrim, size, space, type } from "@/theme/tokens";
import { type TourValue, useTour } from "@/tour/TourProvider";
import { offerText } from "@/tour/stops";
import { Reveal } from "@/ui/motion";
import { Body, Button, Caption, Notice, SwitchRow, TextButton } from "@/ui/primitives";

/** Wraps the places (the tab slot): while the card is up, they are behind it. */
export function TourStage({ children }: { children: ReactNode }) {
  const tour = useTour();
  const open = !!tour && tour.phase !== "closed";
  const behind = useRef<ComponentRef<typeof View>>(null);
  // The web: `inert` keeps keyboard focus out of the place behind the card, as aria-hidden can't.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = behind.current as unknown as { inert?: boolean } | null;
    if (!node) return;
    node.inert = open;
    return () => {
      node.inert = false;
    };
  }, [open]);
  return (
    <View style={styles.fill}>
      <View
        ref={behind}
        style={styles.fill}
        aria-hidden={open || undefined}
        importantForAccessibility={open ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {open && tour ? <TourCard tour={tour} /> : null}
    </View>
  );
}

/** The web: the heading can take focus from code, but isn't a stop for the Tab key (React Native's types lack it on Text). */
const FOCUSABLE_ON_WEB = (Platform.OS === "web" ? { tabIndex: -1 } : {}) as object;

/** Screen readers start at the card's name when it appears: focus on the web, an accessibility focus on phones. */
function focusOn(node: HostInstance | null) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as { focus?: () => void }).focus?.();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

function TourCard({ tour }: { tour: TourValue }) {
  const offer = tour.phase === "offer";
  const stop = offer ? null : tour.stops[tour.index];
  const words = stop ?? offerText();
  const total = tour.stops.length;
  const last = !offer && tour.index === total - 1;
  const heading = useRef<ComponentRef<typeof Text>>(null);

  // The card's name takes focus when the card appears; between stops, focus stays on the
  // button pressed, and the new words are announced (a polite live region).
  useEffect(() => {
    focusOn(heading.current);
  }, [offer]);

  // Escape on the web, as for the sheet.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (offer) tour.later();
      else tour.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [offer, tour]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* The scrim takes the touches meant for the place behind; it does nothing with them. */}
      <View style={styles.scrim} onStartShouldSetResponder={() => true} aria-hidden importantForAccessibility="no-hide-descendants" />
      <Reveal style={styles.dock} duration={motion.duration.base}>
        <View role="dialog" aria-label={t.tour.label} style={styles.sheet}>
          {/* The words scroll if they must (a small screen, large text); the controls under them stay in view. */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {stop ? <Progress index={tour.index} total={total} /> : null}
            {/* The words change with the stop: a polite live region reads the new ones. */}
            <Reveal key={offer ? "offer" : stop?.key} rise={false} duration={motion.duration.fast}>
              <View aria-live="polite" style={styles.words}>
                <View style={styles.plate}>
                  <Text ref={heading} role="heading" aria-level={2} style={styles.plateText} {...FOCUSABLE_ON_WEB}>
                    {words.title}
                  </Text>
                </View>
                <Body>{words.body}</Body>
                {stop && tour.index === 0 ? <Caption>{t.tour.tapStops}</Caption> : null}
              </View>
            </Reveal>
          </ScrollView>
          <View style={styles.controls}>
            {tour.voice.supported ? (
              <SwitchRow label={t.tour.readAloud} value={tour.voice.on} onChange={tour.setVoice} />
            ) : (
              <Caption>{t.tour.noVoice}</Caption>
            )}
            {tour.voice.failed ? <Notice kind="info">{t.tour.voiceFailed}</Notice> : null}
            {offer ? (
              <>
                <Button label={t.tour.start} onPress={tour.begin} />
                <Button label={t.tour.later} variant="secondary" onPress={tour.later} />
                <Caption>{t.tour.laterHint}</Caption>
              </>
            ) : (
              <>
                {last && tour.hasProfile === false ? <Button label={t.tour.createProfile} onPress={tour.createProfile} /> : null}
                <View style={styles.pair}>
                  <View style={styles.half}>
                    <Button label={t.tour.back} variant="secondary" disabled={tour.index === 0} onPress={tour.back} />
                  </View>
                  <View style={styles.half}>
                    <Button
                      label={last ? t.tour.done : t.tour.next}
                      variant={last && tour.hasProfile === false ? "secondary" : "primary"}
                      onPress={tour.next}
                    />
                  </View>
                </View>
                <View style={styles.links}>
                  {tour.voice.on ? <TextButton label={t.tour.listen} onPress={tour.listen} /> : null}
                  <View style={styles.end}>
                    <TextButton label={t.tour.close} onPress={tour.close} />
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Reveal>
    </View>
  );
}

/** The tour's stops on a line, the ones reached filled; the words say where you are. */
function Progress({ index, total }: { index: number; total: number }) {
  return (
    <View style={styles.progress}>
      <View style={styles.line} aria-hidden importantForAccessibility="no-hide-descendants">
        <View style={styles.rail} />
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.roundel, i <= index && styles.roundelReached]} />
        ))}
      </View>
      <Caption>{fill(t.tour.progress, { n: index + 1, total })}</Caption>
    </View>
  );
}

const ROUNDEL = size.roundel;
const RAIL = 4;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.sign, opacity: scrim.opacity },
  // The dock fills the place, so the card's height can be capped at it; touches go through to the scrim.
  dock: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", alignItems: "center", pointerEvents: "box-none" },
  sheet: {
    width: "100%",
    maxWidth: size.contentMax,
    maxHeight: "100%",
    backgroundColor: color.bg,
    borderTopWidth: 2,
    borderTopColor: color.sign,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xs, gap: space.md },
  controls: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  words: { gap: space.md },
  plate: { alignSelf: "flex-start", backgroundColor: color.sign, paddingHorizontal: space.sm, paddingVertical: 2 },
  plateText: {
    ...type.sign,
    color: color.onSign,
    // The heading takes focus so screen readers start there; it isn't a control, so no ring.
    ...(Platform.OS === "web" ? { outlineWidth: 0, outlineStyle: "none" as "solid" } : {}),
  },
  progress: { flexDirection: "row", alignItems: "center", gap: space.md, flexShrink: 1 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rail: { position: "absolute", left: ROUNDEL / 2, right: ROUNDEL / 2, height: RAIL, backgroundColor: color.accent },
  roundel: {
    width: ROUNDEL,
    height: ROUNDEL,
    borderRadius: ROUNDEL / 2,
    borderWidth: size.roundelStroke,
    borderColor: color.sign,
    backgroundColor: color.bg,
  },
  roundelReached: { backgroundColor: color.sign },
  pair: { flexDirection: "row", gap: space.md },
  half: { flex: 1 },
  links: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md },
  end: { marginLeft: "auto" },
});
