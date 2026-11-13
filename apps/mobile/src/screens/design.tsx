/**
 * Every component in every state, on one page (replica-design step 4): the
 * design system check, screenshotted and scanned by axe in the e2e. Samples
 * only; nothing here is a person or real activity.
 */
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, radius, space, type } from "@/theme/tokens";
import { Reveal, staggered } from "@/ui/motion";
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  CardTitle,
  Checkbox,
  SwitchRow,
  ChoiceGroup,
  Enamel,
  Heading,
  ListRow,
  Loading,
  Notice,
  Plate,
  Row,
  Screen,
  Stack,
  TextField,
  TextLink,
  Title,
} from "@/ui/primitives";
import { MoreButton } from "@/ui/MoreButton";
import { Rings } from "@/ui/Rings";
import { RouteMap } from "@/ui/RouteMap";
import { Sheet } from "@/ui/Sheet";

const SWATCHES = Object.entries(color) as [keyof typeof color, string][];
const noop = () => undefined;

export function DesignGallery() {
  const [single, setSingle] = useState<"one" | "two" | undefined>("one");
  const [many, setMany] = useState<("a" | "b" | "c")[]>(["a"]);
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [text, setText] = useState("");
  const [replay, setReplay] = useState(0);
  const [sentence, setSentence] = useState<"short" | "long" | undefined>("short");
  const [sentences, setSentences] = useState<("first" | "next")[]>(["first"]);
  const [sheet, setSheet] = useState(false);

  return (
    <Screen>
      <Title>Design system</Title>
      <Body muted>Internal page: every component and state, with sample text only.</Body>

      <Heading>Colour roles</Heading>
      <View style={styles.swatches}>
        {SWATCHES.map(([role, hex]) => (
          <View key={role} style={styles.swatchRow}>
            <View style={[styles.swatch, { backgroundColor: hex }]} aria-hidden />
            <Caption>{`${role} ${hex}`}</Caption>
          </View>
        ))}
      </View>

      <Heading>Type</Heading>
      {(Object.keys(type) as (keyof typeof type)[]).map((name) => (
        <Text key={name} style={[type[name], styles.sample]}>{`${name}: ${type[name].fontSize}/${type[name].lineHeight}`}</Text>
      ))}
      <Body muted>Muted body text for supporting details.</Body>

      <Heading>Buttons</Heading>
      <Button label="Primary" onPress={noop} />
      <Button label="Secondary" variant="secondary" onPress={noop} />
      <Button label="Danger" variant="danger" onPress={noop} />
      <Button label="Primary, disabled" disabled onPress={noop} />
      <Button label="Secondary, disabled" variant="secondary" disabled onPress={noop} />
      <Button label="Primary, busy" busy onPress={noop} />
      <Button label="Secondary, busy" variant="secondary" busy onPress={noop} />
      <TextLink label="A text link" href="/design" />

      <Heading>Fields</Heading>
      <TextField label="Field" value={text} onChangeText={setText} />
      <TextField label="With a hint" hint="Hints sit between the label and the field." value="" />
      <TextField label="With an error" error="Errors are announced and outlined." value="Wrong" />
      <TextField label="Disabled" editable={false} value="Can't change this" />
      <TextField label="Several lines" multiline value="" />

      <Heading>Choices</Heading>
      <Checkbox label="A checkbox" checked={checked} onChange={setChecked} />
      {/* A setting that takes effect at once is a switch (D116). */}
      <SwitchRow label="A setting that takes effect at once" value={on} onChange={setOn} />
      <ChoiceGroup label="One of these" value={single} onChange={setSingle}
        options={[{ value: "one", label: "Option one" }, { value: "two", label: "Option two" }]} />
      <ChoiceGroup label="Any of these" multiple value={many} onChange={setMany}
        options={[{ value: "a", label: "First" }, { value: "b", label: "Second" }, { value: "c", label: "Third" }]} />
      <ChoiceGroup label="With an error" value={undefined} onChange={noop} error="Choose one."
        options={[{ value: "x", label: "Choice" }]} />
      {/* Choices that are sentences: a list with the line's station roundel (stage 20e, D112). */}
      <ChoiceGroup layout="list" label="One of these sentences" value={sentence} onChange={setSentence}
        options={[
          { value: "short", label: "A short sentence to choose" },
          { value: "long", label: "A longer sentence to choose, long enough to wrap onto a second line on a phone" },
        ]} />
      <ChoiceGroup layout="list" multiple label="Any of these sentences" value={sentences} onChange={setSentences}
        options={[{ value: "first", label: "The first sentence to tick" }, { value: "next", label: "The next sentence to tick" }]} />

      <Heading>Notices and badges</Heading>
      <Notice kind="info">An informational notice.</Notice>
      <Notice kind="success">A success notice.</Notice>
      <Notice kind="error">An error notice.</Notice>
      <Row>
        <Badge label="Neutral" />
        <Badge label="Highlight" tone="highlight" />
        <Badge label="Success" tone="success" />
        <Badge label="Danger" tone="danger" />
      </Row>

      <Heading>Card</Heading>
      <Card label="Sample card: a tappable summary" onPress={noop}>
        <View style={styles.thumb} aria-hidden />
        <Stack>
          <CardTitle>Sample title</CardTitle>
          <Body>Body text inside a card.</Body>
          <Badge label="Status" tone="highlight" />
        </Stack>
      </Card>

      {/* The Interchange's signs and lists (stage 20e): plates, list rows, More options, a sheet. */}
      <Heading>Signs and lists</Heading>
      <Plate>Sample name, 27</Plate>
      <Plate heading level={2}>A heading on a plate</Plate>
      <View style={styles.list}>
        <ListRow label="A place" opens onPress={noop} />
        <ListRow label="A place with a hint" hint="What the row holds" opens onPress={noop} />
        <ListRow label="An action" onPress={noop} />
        <ListRow label="A destructive action" tone="danger" onPress={noop} />
      </View>
      <View style={styles.more}>
        <MoreButton tone="sign" label="More options, on the page" onPress={noop} />
        <View style={styles.signBand}>
          <MoreButton label="More options, on the sign" onPress={noop} />
        </View>
      </View>
      <Button label="Open a sample sheet" variant="secondary" onPress={() => setSheet(true)} />
      <Sheet visible={sheet} onClose={() => setSheet(false)} label="A sample sheet">
        <Plate>Sample sheet</Plate>
        <View>
          <ListRow label="An action in the sheet" onPress={noop} />
        </View>
        <Button label="Close" variant="secondary" onPress={() => setSheet(false)} />
      </Sheet>

      <Heading>Loading</Heading>
      <Loading label="Loading" />

      <Heading>Motion</Heading>
      <Body muted>
        Each plays once when it appears; Replay shows it again. With reduce motion on, everything is drawn at rest.
      </Body>
      <Button label="Replay" variant="secondary" onPress={() => setReplay((n) => n + 1)} />
      <View key={replay} style={styles.motion}>
        <Caption>Meet: the welcome screen</Caption>
        <Rings mode="meet" />
        <Caption>Breathe: a day with no new introductions (twice, then rest)</Caption>
        <Rings mode="breathe" />
        <Caption>Join: a match</Caption>
        <Rings mode="join" />
        <Caption>Relief: the welcome map lifts into 3D and their ring hooks yours, then rests</Caption>
        <Enamel>
          <RouteMap />
        </Enamel>
        <Caption>Reveal: list items rise in, a little apart</Caption>
        {["First", "Second", "Third"].map((label, i) => (
          <Reveal key={label} delay={staggered(i)}>
            <Card label={`Sample card: ${label}`} onPress={noop}>
              <Stack>
                <CardTitle>{label}</CardTitle>
                <Body>Rises into place.</Body>
              </Stack>
            </Card>
          </Reveal>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatches: { gap: space.sm },
  swatchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  swatch: { width: space.xxl, height: space.xxl, borderRadius: radius.plate, borderWidth: 1, borderColor: color.border },
  sample: { color: color.text },
  thumb: { width: space.xxxl, height: space.xxxl, borderRadius: radius.plate, backgroundColor: color.surface },
  motion: { gap: space.md },
  list: { borderTopWidth: 1, borderTopColor: color.border },
  more: { flexDirection: "row", alignItems: "center", gap: space.md },
  signBand: { backgroundColor: color.sign, paddingHorizontal: space.sm },
});
