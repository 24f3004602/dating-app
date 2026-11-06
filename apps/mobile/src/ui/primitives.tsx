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
import { type ReactNode, useEffect, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { color, focusRing, motion, radius, size, space, touch, type } from "@/theme/tokens";
import { FadeImage, Reveal, usePressScale, useScreenEntrance } from "@/ui/motion";

/** React Native Web also reports focus and hover; native platforms report only `pressed`. */
type PressState = PressableStateCallbackType & { focused?: boolean; hovered?: boolean };

/** The web focus ring, drawn outside the control so it sits on the page colour. */
const ring: ViewStyle =
  Platform.OS === "web"
    ? { outlineColor: color.focus, outlineStyle: "solid", outlineWidth: focusRing.width, outlineOffset: focusRing.offset }
    : {};

function focusStyle(state: PressableStateCallbackType): ViewStyle | false {
  return !!(state as PressState).focused && ring;
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

export function Screen({ children }: { children: ReactNode }) {
  const entrance = useScreenEntrance();
  return (
    <SafeAreaView style={styles.safe}>
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
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text role="heading" aria-level={1} style={styles.title}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text role="heading" aria-level={2} style={styles.heading}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

/** Small supporting text: times, hints, counts. */
export function Caption({ children }: { children: ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
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
          focusStyle(state),
        ]}
      >
        {busy ? (
          // The label stays the accessible name and aria-busy says it's working, so the
          // spinner is hidden: on the web it is an unnamed progressbar (found by axe).
          <ActivityIndicator color={variant === "primary" ? color.onAccent : color.accent} aria-hidden />
        ) : (
          <Text style={[styles.buttonText, buttonText[variant], disabled && styles.textDisabled]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Navigation inside text: a real link on the web, underlined, with a 44-point target. */
export function TextLink({ label, href }: { label: string; href: Href }) {
  return (
    <Link href={href} asChild>
      <Pressable role="link" aria-label={label} style={(state) => [styles.link, focusStyle(state)]}>
        {({ pressed }) => <Text style={[styles.linkText, pressed && styles.linkPressed]}>{label}</Text>}
      </Pressable>
    </Link>
  );
}

/** A link to a web page outside the app (the documents): the browser opens it,
 *  in a new tab on the web, so a half-filled form isn't lost. */
export function ExternalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable role="link" aria-label={label} onPress={() => void Linking.openURL(url)}
      style={(state) => [styles.link, focusStyle(state)]}>
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
  return (
    <View style={styles.field}>
      <Pressable
        role="checkbox"
        aria-label={label}
        aria-checked={checked}
        onPress={() => onChange(!checked)}
        style={(state) => [styles.choiceRow, focusStyle(state)]}
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
              style={(state) => [styles.chip, on && styles.chipOn, state.pressed && !on && styles.chipPressed, focusStyle(state)]}
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
  return (
    <Animated.View style={press.style}>
      <Pressable
        role="button"
        aria-label={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={(state) => [styles.card, state.pressed && styles.cardPressed, focusStyle(state)]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

/**
 * A square photo. Decorative unless it has a label (the card or text beside it
 * names the person). It fades in as it loads, over its placeholder colour.
 */
export function Thumb({ uri, label }: { uri: string; label?: string }) {
  return (
    <View style={styles.thumb}>
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
  screen: { padding: space.xl, gap: space.lg, maxWidth: size.contentMax, width: "100%", alignSelf: "center" },
  title: { ...type.title, color: color.text },
  heading: { ...type.heading, color: color.text },
  body: { ...type.body, color: color.text, flexShrink: 1 },
  muted: { color: color.textMuted },
  caption: { ...type.caption, color: color.textMuted },

  button: {
    minHeight: touch.min,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  secondary: { backgroundColor: color.bg, borderColor: color.accent },
  danger: { backgroundColor: color.bg, borderColor: color.danger },
  buttonDisabled: { backgroundColor: color.surface, borderColor: color.border },
  buttonText: { ...type.label },
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
    borderRadius: radius.sm,
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
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: color.borderInput,
    backgroundColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.accent, borderColor: color.accent },
  boxPressed: { borderColor: color.accentPressed },
  tick: { ...type.label, color: color.onAccent },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: touch.chip,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderInput,
    backgroundColor: color.bg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  chipOn: { backgroundColor: color.accent, borderColor: color.accent },
  chipPressed: { backgroundColor: color.accentSoft },
  chipText: { ...type.body, color: color.text },
  chipTextOn: { ...type.label, color: color.onAccent },

  notice: { padding: space.md, borderRadius: radius.md, borderLeftWidth: 4 },

  badgeBox: { alignSelf: "flex-start" },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs / 2 },
  badgeText: { ...type.caption, fontWeight: "600", color: color.text },

  card: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderInput,
    backgroundColor: color.bg,
  },
  cardPressed: { backgroundColor: color.surface },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.md, backgroundColor: color.surface, overflow: "hidden" },
  photoBox: { width: "100%", borderRadius: radius.md, backgroundColor: color.surface, overflow: "hidden" },
  fill: { width: "100%", height: "100%" },

  center: { alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xxl },
  row: { flexDirection: "row", gap: space.md, alignItems: "center", flexWrap: "wrap" },
  stack: { flex: 1, gap: space.xs },
});

const pressedButton = StyleSheet.create({
  primary: { backgroundColor: color.accentPressed, borderColor: color.accentPressed },
  secondary: { backgroundColor: color.accentSoft },
  danger: { backgroundColor: color.dangerSoft },
});

const buttonText = StyleSheet.create({
  primary: { color: color.onAccent },
  secondary: { color: color.accent },
  danger: { color: color.danger },
});

const notice = StyleSheet.create({
  info: { backgroundColor: color.accentSoft, borderLeftColor: color.accent },
  success: { backgroundColor: color.successSoft, borderLeftColor: color.success },
  error: { backgroundColor: color.dangerSoft, borderLeftColor: color.danger },
});

const badge = StyleSheet.create({
  neutral: { backgroundColor: color.surface },
  highlight: { backgroundColor: color.highlight },
  success: { backgroundColor: color.successSoft },
  danger: { backgroundColor: color.dangerSoft },
});
