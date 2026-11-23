/**
 * The safety guide (S11, D140): what to watch for in chats, on calls and on dates, what the
 * app's own tools do, and who to call in India. Static words from the strings file: nothing
 * is sent or kept, and it works without a connection once the app is open.
 */
import { Linking, StyleSheet, View } from "react-native";

import { fill, t } from "@/i18n/en";
import { color, space } from "@/theme/tokens";
import { Body, Button, Caption, CardTitle, ExternalLink, Heading, Plate, Screen, Title } from "@/ui/primitives";

const guide = t.safetyGuide;
const EMERGENCY = guide.helplines.items[0];
const PORTAL = "https://cybercrime.gov.in";

/** Opens the phone's dialer with the number filled in; the member still presses call. */
export function dial(number: string): void {
  // No dialer (a tablet, a desktop browser): nothing opens, and the number stays on screen.
  Linking.openURL(`tel:${number}`).catch(() => undefined);
}

function CallButton({ number, name }: { number: string; name: string }) {
  return (
    <Button
      label={fill(guide.helplines.call, { number })}
      accessibleName={fill(guide.helplines.callName, { number, name })}
      variant="secondary"
      onPress={() => dial(number)}
    />
  );
}

export function SafetyGuideScreen() {
  return (
    <Screen>
      <Title>{guide.title}</Title>
      <Body muted>{guide.intro}</Body>
      {/* First, for someone in trouble now: the emergency number, one press from the dialer. */}
      <View style={styles.group}>
        <Body>{guide.danger}</Body>
        <CallButton number={EMERGENCY.number} name={EMERGENCY.name} />
      </View>
      {guide.sections.map((section) => (
        <View key={section.title} style={styles.group}>
          <Heading>{section.title}</Heading>
          {/* A station list (D108): a line on top, a line under each point; no glyph bullets. */}
          <View role="list" style={styles.list}>
            {section.points.map((point) => (
              <View key={point} role="listitem" style={styles.item}>
                <Body>{point}</Body>
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={styles.group}>
        <Heading>{guide.helplines.title}</Heading>
        <Body muted>{guide.helplines.intro}</Body>
        <View role="list" style={styles.list}>
          {guide.helplines.items.map((line) => (
            <View key={line.number} role="listitem" style={styles.item}>
              {/* The number on a sign plate, like a station's code, with whose line it is beside it. */}
              <View style={styles.head}>
                <Plate>{line.number}</Plate>
                <View style={styles.name}>
                  <CardTitle>{line.name}</CardTitle>
                </View>
              </View>
              <Body>{line.about}</Body>
              {line.number === "1930" ? <ExternalLink label={guide.helplines.portal} url={PORTAL} /> : null}
              <CallButton number={line.number} name={line.name} />
            </View>
          ))}
        </View>
        <Caption>{guide.helplines.checked}</Caption>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A heading and what it heads stay together; the screen's own gap separates the groups.
  group: { gap: space.sm },
  list: { borderTopWidth: 1, borderTopColor: color.border },
  item: { gap: space.sm, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { flex: 1 },
});
