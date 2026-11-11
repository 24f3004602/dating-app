/**
 * The design system's components (stage 13, D088; specs in replica/design/components.md).
 *
 * - Every control has a role, a label and its state for screen readers.
 * - Touch targets: 48 points for buttons and fields, 44 for chips and links.
 * - On the web, keyboard focus shows a 2-point ring outside the control.
 * - Pressed and disabled states differ by colour, not just opacity.
 * - Only design tokens: no raw colours, sizes or fonts.
 * - Motion (stage 19, D098) is small and follows reduce motion (ui/motion.tsx):
 *   buttons and cards press in slightly, notices and badges fade in, photos fade
 *   in as they load, and screens fade in on the web.
 */
import { type Href, Link } from "expo-router";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  type PressableStateCallbackType,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { color, focusRing, font, motion, radius, size, space, touch, type } from "@/theme/tokens";
import { FadeImage, Reveal, usePressScale, useScreenEntrance } from "@/ui/motion";

/** React Native Web also reports focus and hover; native platforms report only `pressed`. */
type PressState = PressableStateCallbackType & { focused?: boolean; hovered?: boolean };

/** The web focus ring, drawn outside the control so it sits on the page colour. */
const ring: ViewStyle =
  Platform.OS === "web"
    ? { outlineColor: color.focus, outlineStyle: "solid", outlineWidth: focusRing.width, outlineOffset: focusRing.offset }
    : {};

/**
 * Inside an overlay screen (the welcome screen over its video, stage 19, D099):
 * text is light and the focus ring is marigold, the pairs checked on the
 * overlay's brightest point (tokens.json, overlay-floor).
 */
/**
 * The edges a `Screen` still pads for the system bars. A layout that draws its own bar over
 * an edge (the stack's top bar, the sign band, the bottom bar) takes that edge off, so the
 * inset isn't added twice (BUG-005, measured on a device: 44 dp of empty space under every bar).
 */
export const ALL_EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];
export const UNDER_TOP_BAR: readonly Edge[] = ["right", "bottom", "left"];
export const BETWEEN_BARS: readonly Edge[] = ["right", "left"];
export const ScreenEdges = createContext<readonly Edge[]>(ALL_EDGES);

const OnOverlay = createContext(false);
export const useOnOverlay = () => useContext(OnOverlay);

const overlayRing: ViewStyle = Platform.OS === "web" ? { ...ring, outlineColor: color.highlight } : {};

function useRing(): ViewStyle {
  return useOnOverlay() ? overlayRing : ring;
}

function focusStyle(state: PressableStateCallbackType, focusRingStyle: ViewStyle = ring): ViewStyle | false {
  return !!(state as PressState).focused && focusRingStyle;
}

/**
 * Fields show focus with their border. Chrome's own ring is `outline-style: auto`,
 * which ignores the width, so the style goes too (found in the gallery screenshot).
 */
const noBrowserRing = (
  Platform.OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } : {}
) as TextStyle; // "none" is CSS that React Native Web passes through; React Native's types list only solid, dotted, dashed

/** iOS ignores live regions, so errors are announced explicitly there (Android and the web use aria-live). */
function useAnnounce(message: ReactNode, active: boolean) {
  useEffect(() => {
    if (active && Platform.OS === "ios" && typeof message === "string") AccessibilityInfo.announceForAccessibility(message);
  }, [message, active]);
}

/** `overlay`: the screen sits over a dark backdrop (its own background is clear). */
export function Screen({ children, overlay = false }: { children: ReactNode; overlay?: boolean }) {
  const entrance = useScreenEntrance();
  const edges = useContext(ScreenEdges);
  return (
    <OnOverlay.Provider value={overlay}>
    <SafeAreaView edges={edges} style={[styles.safe, overlay && styles.clear]}>
      {/* Focusable on web so keyboard users can scroll screens without controls (WCAG 2.1.1; found by axe). */}
      <Animated.ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        focusable={Platform.OS === "web"}
        style={entrance.style}
        {...entrance.data}
      >
        {children}
      </Animated.ScrollView>
    </SafeAreaView>
    </OnOverlay.Provider>
  );
}

/** `display`: the welcome screen's headline size (the Interchange's display voice). */
export function Title({ children, display }: { children: ReactNode; display?: boolean }) {
  return (
    <Text role="heading" aria-level={1} style={[styles.title, display && styles.display, useOnOverlay() && styles.onOverlay]}>
      {children}
    </Text>
  );
}

/**
 * A white enamel panel on a dark screen (the welcome screen's route map, D105): what's
 * inside reads as on the page, so the rings keep their teal and text its colour.
 */
export function Enamel({ children }: { children: ReactNode }) {
  return (
    <OnOverlay.Provider value={false}>
      <View style={styles.enamel}>{children}</View>
    </OnOverlay.Provider>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text role="heading" aria-level={2} style={[styles.heading, useOnOverlay() && styles.onOverlay]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  // On the overlay there's no muted grey that keeps its contrast: everything is light.
  return <Text style={[styles.body, muted && styles.muted, useOnOverlay() && styles.onOverlay]}>{children}</Text>;
}

/** Small supporting text: times, hints, counts. */
export function Caption({ children }: { children: ReactNode }) {
  return <Text style={[styles.caption, useOnOverlay() && styles.onOverlay]}>{children}</Text>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
};

export function Button({ label, onPress, variant = "primary", disabled, busy, hint }: ButtonProps) {
  const inactive = !!(disabled || busy);
  const press = usePressScale();
  const focusRingStyle = useRing();
  return (
    <Animated.View style={press.style}>
      <Pressable
        role="button"
        aria-label={label}
        accessibilityHint={hint}
        aria-disabled={inactive}
        aria-busy={!!busy}
        disabled={inactive}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={(state) => [
          styles.button,
          styles[variant],
          state.pressed && pressedButton[variant],
          disabled && styles.buttonDisabled,
          focusStyle(state, focusRingStyle),
        ]}
      >
        {busy ? (
          // The label stays the accessible name and aria-busy says it's working, so the
          // spinner is hidden: on the web it is an unnamed progressbar (found by axe).
          <ActivityIndicator color={variant === "danger" ? color.danger : color.sign} aria-hidden />
        ) : (
          <Text style={[styles.buttonText, buttonText[variant], disabled && styles.textDisabled]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Navigation inside text: a real link on the web, underlined, with a 44-point target. */
export function TextLink({ label, href }: { label: string; href: Href }) {
  const focusRingStyle = useRing();
  return (
    <Link href={href} asChild>
      <Pressable role="link" aria-label={label} style={(state) => [styles.link, focusStyle(state, focusRingStyle)]}>
        {({ pressed }) => <Text style={[styles.linkText, pressed && styles.linkPressed]}>{label}</Text>}
      </Pressable>
    </Link>
  );
}

/** A link to a web page outside the app (the documents): the browser opens it,
 *  in a new tab on the web, so a half-filled form isn't lost. */
export function ExternalLink({ label, url }: { label: string; url: string }) {
  const focusRingStyle = useRing();
  return (
    <Pressable role="link" aria-label={label} onPress={() => void Linking.openURL(url)}
      style={(state) => [styles.link, focusStyle(state, focusRingStyle)]}>
      {({ pressed }) => <Text style={[styles.linkText, pressed && styles.linkPressed]}>{label}</Text>}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, style, multiline, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.caption}>{hint}</Text> : null}
      <TextInput
        aria-label={label}
        accessibilityHint={hint}
        aria-disabled={input.editable === false}
        aria-invalid={!!error}
        placeholderTextColor={color.textMuted}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          noBrowserRing,
          multiline && styles.multiline,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          input.editable === false && styles.inputDisabled,
          style,
        ]}
        {...input}
      />
      <FieldError message={error} />
    </View>
  );
}

export function FieldError({ message }: { message?: string }) {
  useAnnounce(message, !!message);
  if (!message) return null;
  return (
    <Text role="alert" aria-live="polite" style={styles.error}>
      {message}
    </Text>
  );
}

export function Checkbox({ label, checked, onChange, error }: { label: string; checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  const focusRingStyle = useRing();
  return (
    <View style={styles.field}>
      <Pressable
        role="checkbox"
        aria-label={label}
        aria-checked={checked}
        onPress={() => onChange(!checked)}
        style={(state) => [styles.choiceRow, focusStyle(state, focusRingStyle)]}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.box, checked && styles.boxOn, pressed && styles.boxPressed]}>
              {checked ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.body}>{label}</Text>
          </>
        )}
      </Pressable>
      <FieldError message={error} />
    </View>
  );
}

type ChoiceProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  error?: string;
} & ({ multiple?: false; value: T | undefined; onChange: (v: T) => void } | { multiple: true; value: T[]; onChange: (v: T[]) => void });

export function ChoiceGroup<T extends string>(props: ChoiceProps<T>) {
  const focusRingStyle = useRing();
  const selected = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const toggle = (v: T) => {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
    }
  };
  return (
    <View style={styles.field} role={props.multiple ? "group" : "radiogroup"} aria-label={props.label}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.chips}>
        {props.options.map((o) => {
          const on = selected(o.value);
          return (
            <Pressable
              key={o.value}
              role={props.multiple ? "checkbox" : "radio"}
              aria-label={o.label}
              aria-checked={on}
              onPress={() => toggle(o.value)}
              style={(state) => [styles.chip, on && styles.chipOn, state.pressed && !on && styles.chipPressed, focusStyle(state, focusRingStyle)]}
            >
              {/* A tick as well as the fill: the choice isn't shown by colour alone (WCAG 1.4.1). */}
              {on ? <Text style={styles.chipTextOn} aria-hidden>✓</Text> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <FieldError message={props.error} />
    </View>
  );
}

export function Notice({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  useAnnounce(children, kind === "error");
  return (
    <Reveal duration={motion.duration.fast}>
      <View role={kind === "error" ? "alert" : undefined} aria-live="polite" style={[styles.notice, notice[kind]]}>
        <Text style={styles.body}>{children}</Text>
      </View>
    </Reveal>
  );
}

type BadgeTone = "neutral" | "highlight" | "success" | "danger";

/** A short status: "2 new", "Your turn", "Pending review". A new status fades in; badges never pulse. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <Reveal key={label} rise={false} duration={motion.duration.fast} style={styles.badgeBox}>
      <View style={[styles.badge, badge[tone]]}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
    </Reveal>
  );
}

/**
 * A tappable summary (a person, a match). The `label` is the whole accessible
 * name; the children are what sighted people see, so they hold no headings.
 */
export function Card({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const press = usePressScale(0.99);
  const focusRingStyle = useRing();
  return (
    <Animated.View style={press.style}>
      <Pressable
        role="button"
        aria-label={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={(state) => [styles.card, state.pressed && styles.cardPressed, focusStyle(state, focusRingStyle)]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

/** A name on a graphite sign plate, as the Interchange letters its station names (D105). */
export function Plate({ children }: { children: ReactNode }) {
  return (
    <View style={styles.plate}>
      <Text style={styles.plateText}>{children}</Text>
    </View>
  );
}

/**
 * A small photo: square, or `portrait` (4:5, the shape members' photos are kept in).
 * Decorative unless it has a label (the card or text beside it names the person).
 * It fades in as it loads, over its placeholder colour.
 */
export function Thumb({ uri, label, portrait }: { uri: string; label?: string; portrait?: boolean }) {
  return (
    <View style={[styles.thumb, portrait && styles.portrait]}>
      {label ? (
        <FadeImage source={{ uri }} style={styles.fill} role="img" aria-label={label} />
      ) : (
        <FadeImage source={{ uri }} style={styles.fill} aria-hidden />
      )}
    </View>
  );
}

/** A large photo (a person's profile). It fades in over its placeholder colour too. */
export function Photo({ uri, label, style }: { uri: string; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.photoBox, style]}>
      <FadeImage source={{ uri }} style={styles.fill} role="img" aria-label={label} />
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center} aria-label={label} role="progressbar" aria-busy>
      <ActivityIndicator color={color.accent} aria-hidden />
      <Text style={[styles.body, styles.muted]}>{label}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** Laid out next to text: shrink to fit, never push the text off screen. */
export function Stack({ children }: { children: ReactNode }) {
  return <View style={styles.stack}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  clear: { backgroundColor: "transparent" },
  onOverlay: { color: color.onAccent },
  screen: { padding: space.xl, gap: space.lg, maxWidth: size.contentMax, width: "100%", alignSelf: "center" },
  title: { ...type.title, color: color.text },
  display: { ...type.display },
  enamel: { backgroundColor: color.bg, padding: space.lg, borderRadius: radius.plate },
  heading: { ...type.heading, color: color.text },
  body: { ...type.body, color: color.text, flexShrink: 1 },
  muted: { color: color.textMuted },
  caption: { ...type.caption, color: color.textMuted },

  // Buttons are sign plates (the Interchange, D105): square, the primary one marigold
  // lettered in graphite, the others outlined in their colour.
  button: {
    minHeight: touch.min,
    borderRadius: radius.plate,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  primary: { backgroundColor: color.highlight, borderColor: color.highlight },
  secondary: { backgroundColor: color.bg, borderColor: color.sign },
  danger: { backgroundColor: color.bg, borderColor: color.danger },
  buttonDisabled: { backgroundColor: color.surface, borderColor: color.border },
  buttonText: { ...type.label, fontFamily: font.sign },
  textDisabled: { color: color.textMuted },

  link: { minHeight: touch.chip, justifyContent: "center", alignSelf: "flex-start" },
  linkText: { ...type.body, color: color.accent, textDecorationLine: "underline" },
  linkPressed: { color: color.accentPressed },

  field: { gap: space.xs },
  label: { ...type.label, color: color.text },
  input: {
    minHeight: touch.min,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radius.plate,
    paddingHorizontal: space.md,
    ...type.body,
    color: color.text,
    backgroundColor: color.bg,
  },
  multiline: { minHeight: size.multiline, paddingVertical: space.sm, textAlignVertical: "top" },
  inputFocused: { borderColor: color.accent, borderWidth: 2 },
  inputError: { borderColor: color.danger, borderWidth: 2 },
  inputDisabled: { backgroundColor: color.surface, color: color.textMuted },
  error: { ...type.caption, color: color.danger },

  choiceRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch.min },
  box: {
    width: size.checkbox,
    height: size.checkbox,
    borderRadius: radius.plate,
    borderWidth: 2,
    borderColor: color.borderInput,
    backgroundColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.sign, borderColor: color.sign },
  boxPressed: { borderColor: color.accent },
  tick: { ...type.label, color: color.onSign },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: touch.chip,
    paddingHorizontal: space.lg,
    borderRadius: radius.plate,
    borderWidth: 1,
    borderColor: color.borderInput,
    backgroundColor: color.bg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  chipOn: { backgroundColor: color.sign, borderColor: color.sign },
  chipPressed: { backgroundColor: color.surface },
  chipText: { ...type.body, color: color.text },
  chipTextOn: { ...type.label, color: color.onSign },

  notice: { padding: space.md, borderRadius: radius.plate, borderWidth: 2 },

  badgeBox: { alignSelf: "flex-start" },
  badge: { borderRadius: radius.plate, paddingHorizontal: space.sm, paddingVertical: space.xs / 2 },
  badgeText: { ...type.caption, fontFamily: font.textSemibold, color: color.text },

  card: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.plate,
    borderWidth: 1,
    borderColor: color.borderInput,
    backgroundColor: color.bg,
  },
  cardPressed: { backgroundColor: color.surface },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.plate, backgroundColor: color.surface, overflow: "hidden" },
  portrait: { height: (size.thumb * 5) / 4 },
  plate: { alignSelf: "flex-start", backgroundColor: color.sign, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.plate },
  plateText: { ...type.sign, color: color.onSign },
  photoBox: { width: "100%", borderRadius: radius.plate, backgroundColor: color.surface, overflow: "hidden" },
  fill: { width: "100%", height: "100%" },

  center: { alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xxl },
  row: { flexDirection: "row", gap: space.md, alignItems: "center", flexWrap: "wrap" },
  stack: { flex: 1, gap: space.xs },
});

const pressedButton = StyleSheet.create({
  primary: { backgroundColor: color.highlightPressed, borderColor: color.highlightPressed },
  secondary: { backgroundColor: color.surface },
  danger: { backgroundColor: color.dangerSoft },
});

const buttonText = StyleSheet.create({
  primary: { color: color.sign },
  secondary: { color: color.sign },
  danger: { color: color.danger },
});

const notice = StyleSheet.create({
  info: { backgroundColor: color.accentSoft, borderColor: color.accent },
  success: { backgroundColor: color.successSoft, borderColor: color.success },
  error: { backgroundColor: color.dangerSoft, borderColor: color.danger },
});

const badge = StyleSheet.create({
  neutral: { backgroundColor: color.surface },
  highlight: { backgroundColor: color.highlight },
  success: { backgroundColor: color.successSoft },
  danger: { backgroundColor: color.dangerSoft },
});
