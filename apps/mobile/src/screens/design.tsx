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
  ChoiceGroup,
  Heading,
  Loading,
  Notice,
  Row,
  Screen,
  Stack,
  TextField,
  TextLink,
  Title,
} from "@/ui/primitives";
import { Rings } from "@/ui/Rings";

const SWATCHES = Object.entries(color) as [keyof typeof color, string][];
const noop = () => undefined;

export function DesignGallery() {
  const [single, setSingle] = useState<"one" | "two" | undefined>("one");
  const [many, setMany] = useState<("a" | "b" | "c")[]>(["a"]);
  const [checked, setChecked] = useState(true);
  const [text, setText] = useState("");
  const [replay, setReplay] = useState(0);

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
      <ChoiceGroup label="One of these" value={single} onChange={setSingle}
        options={[{ value: "one", label: "Option one" }, { value: "two", label: "Option two" }]} />
      <ChoiceGroup label="Any of these" multiple value={many} onChange={setMany}
        options={[{ value: "a", label: "First" }, { value: "b", label: "Second" }, { value: "c", label: "Third" }]} />
      <ChoiceGroup label="With an error" value={undefined} onChange={noop} error="Choose one."
        options={[{ value: "x", label: "Choice" }]} />

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
  swatch: { width: space.xxl, height: space.xxl, borderRadius: radius.sm, borderWidth: 1, borderColor: color.border },
  sample: { color: color.text },
  thumb: { width: space.xxxl, height: space.xxxl, borderRadius: radius.md, backgroundColor: color.surface },
  motion: { gap: space.md },
});
