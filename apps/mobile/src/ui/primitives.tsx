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
import { type Href, Link, Stack as RouterStack } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  type PressableStateCallbackType,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";

import { color, focusRing, font, motion, radius, size, space, touch, type } from "@/theme/tokens";
import { easing, FadeImage, nativeDriver, Reveal, usePressScale, useReducedMotion, useScreenEntrance } from "@/ui/motion";

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

/**
 * A screen's title tells the screen its text and where it ends, so the top app bar can
 * take over the screen's name once the title has scrolled under it (Android's top app
 * bar keeps the context; impeccable's finish review, D116).
 */
const TitleReport = createContext<((text: string, bottom: number) => void) | null>(null);

/** A title's words when they are plain text (every title in the app is). */
function plainText(children: ReactNode): string | null {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children) && children.every((c) => typeof c === "string" || typeof c === "number")) return children.join("");
  return null;
}

/**
 * The screen's name in the top app bar: it fades in (at once with reduce motion). Screen
 * readers already have the page's own heading, so this copy is hidden from them.
 */
function BarTitle({ children }: { children: string }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: motion.duration.fast, easing: easing.standard, useNativeDriver: nativeDriver }).start();
  }, [opacity, reduced]);
  return (
    <Animated.Text aria-hidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[styles.barTitle, { opacity }]}>
      {children}
    </Animated.Text>
  );
}

/** `overlay`: the screen sits over a dark backdrop (its own background is clear). */
export function Screen({ children, overlay = false }: { children: ReactNode; overlay?: boolean }) {
  const entrance = useScreenEntrance();
  const edges = useContext(ScreenEdges);
  // Under a top app bar (the stacks' screens; the four places have their own sign band).
  const underBar = edges === UNDER_TOP_BAR;
  const [title, setTitle] = useState<{ text: string; bottom: number } | null>(null);
  const [inBar, setInBar] = useState(false);
  const report = useCallback((text: string, bottom: number) => {
    setTitle((was) => (was && was.text === text && was.bottom === bottom ? was : { text, bottom }));
  }, []);
  const onScroll = title
    ? (e: NativeSyntheticEvent<NativeScrollEvent>) => setInBar(e.nativeEvent.contentOffset.y > title.bottom)
    : undefined;
  return (
    <OnOverlay.Provider value={overlay}>
    <TitleReport.Provider value={underBar ? report : null}>
    <SafeAreaView edges={edges} style={[styles.safe, overlay && styles.clear]}>
      {/* Only while the name is in the bar: on Android a title function, even one returning
          nothing, takes the bar's left slot and the back arrow with it (seen on the phone). */}
      {underBar && title ? (
        <RouterStack.Screen options={{ headerTitle: inBar ? () => <BarTitle>{title.text}</BarTitle> : undefined }} />
      ) : null}
      {/* Focusable on web so keyboard users can scroll screens without controls (WCAG 2.1.1; found by axe). */}
      <Animated.ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        focusable={Platform.OS === "web"}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={entrance.style}
        {...entrance.data}
      >
        {children}
      </Animated.ScrollView>
    </SafeAreaView>
    </TitleReport.Provider>
    </OnOverlay.Provider>
  );
}

/** `display`: the welcome screen's headline size (the Interchange's display voice). */
export function Title({ children, display }: { children: ReactNode; display?: boolean }) {
  const report = useContext(TitleReport);
  const text = plainText(children);
  return (
    <Text
      role="heading"
      aria-level={1}
      onLayout={report && text ? (e) => report(text, e.nativeEvent.layout.y + e.nativeEvent.layout.height) : undefined}
      style={[styles.title, display && styles.display, useOnOverlay() && styles.onOverlay]}
    >
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
/** A label for a group of fields, in the field label's style (a field's own label lives in TextField). */
export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

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
  /** The accessible name when the label needs its context ("Unblock" is read "Unblock Kabir"); it starts with the label (WCAG 2.5.3). */
  accessibleName?: string;
};

export function Button({ label, onPress, variant = "primary", disabled, busy, hint, accessibleName }: ButtonProps) {
  const inactive = !!(disabled || busy);
  const press = usePressScale();
  const focusRingStyle = useRing();
  return (
    <Animated.View style={press.style}>
      <Pressable
        role="button"
        aria-label={accessibleName ?? label}
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
              {checked ? <View style={styles.tick} /> : null}
            </View>
            <Text style={styles.body}>{label}</Text>
          </>
        )}
      </Pressable>
      <FieldError message={error} />
    </View>
  );
}

/**
 * An on/off setting that takes effect at once (Pause, the notification kinds): Android's own
 * switch, themed, beside its label (Material; impeccable's finish review, D116). The switch
 * is the one control, named by the label; tapping the label flips it too, without a second
 * stop for screen readers or the keyboard. Its state isn't colour alone: the thumb moves.
 */
export function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Pressable
        accessible={false}
        focusable={false}
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        onPress={() => onChange(!value)}
        style={styles.switchLabel}
      >
        <Text style={styles.body}>{label}</Text>
      </Pressable>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.borderInput, true: color.accent }}
        thumbColor={color.bg}
        // The web's switch is a checkbox input with the switch role that carries its own state.
        {...(Platform.OS === "web" ? { activeThumbColor: color.bg, style: styles.switchWeb } : { accessibilityState: { checked: value } })}
      />
    </View>
  );
}

type ChoiceProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  error?: string;
  /** "list" for choices that are sentences: rows with the line's station roundel (D112). Chips otherwise. */
  layout?: "chips" | "list";
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
  const list = props.layout === "list";
  return (
    <View style={styles.field} role={props.multiple ? "group" : "radiogroup"} aria-label={props.label}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={list ? styles.choiceList : styles.chips}>
        {props.options.map((o) => {
          const on = selected(o.value);
          const role = props.multiple ? "checkbox" : "radio";
          if (list) {
            return (
              <Pressable
                key={o.value}
                role={role}
                aria-label={o.label}
                aria-checked={on}
                onPress={() => toggle(o.value)}
                style={(state) => [styles.choiceRow, styles.listChoice, state.pressed && styles.listChoicePressed, focusStyle(state, focusRingStyle)]}
              >
                {/* One choice: the line's station roundel, filled when chosen, as the bar marks where you are;
                    several: a square box with a tick. Shape and fill, not colour alone (WCAG 1.4.1). */}
                <View style={props.multiple ? [styles.box, on && styles.boxOn] : [styles.roundel, on && styles.roundelOn]} aria-hidden>
                  {props.multiple && on ? <View style={styles.tick} /> : null}
                </View>
                <Text style={styles.body}>{o.label}</Text>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={o.value}
              role={role}
              aria-label={o.label}
              aria-checked={on}
              onPress={() => toggle(o.value)}
              style={(state) => [styles.chip, on && styles.chipOn, state.pressed && !on && styles.chipPressed, focusStyle(state, focusRingStyle)]}
            >
              {/* A tick as well as the fill: the choice isn't shown by colour alone (WCAG 1.4.1). */}
              {on ? (
                <View style={styles.chipTick} aria-hidden>
                  <View style={styles.tick} aria-hidden />
                </View>
              ) : null}
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

/**
 * A name on a graphite sign plate, as the Interchange letters its station names (D105).
 * `heading`: the page's own heading, at title size (a person's profile); with `level={2}`
 * a section's heading in the plate's own size (your name under "Your profile").
 */
export function Plate({ children, heading, level = 1 }: { children: ReactNode; heading?: boolean; level?: 1 | 2 }) {
  // A plate that is the page's heading (a person's name) names the screen in the top bar too.
  const report = useContext(TitleReport);
  const text = heading && level === 1 ? plainText(children) : null;
  return (
    <View style={styles.plate} onLayout={report && text ? (e) => report(text, e.nativeEvent.layout.y + e.nativeEvent.layout.height) : undefined}>
      <Text
        role={heading ? "heading" : undefined}
        aria-level={heading ? level : undefined}
        style={[styles.plateText, heading && level === 1 && styles.plateTitle]}
      >
        {children}
      </Text>
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

/**
 * One row in a list of places or actions (Material's list item, in the Interchange, stage
 * 20e, D108): the label in heading type with a hint under it, a line under each row and a
 * 56-point target; pressed: surface. `opens` draws an arrow: the row leads to another screen.
 */
export function ListRow({ label, hint, onPress, opens, tone }: { label: string; hint?: string; onPress: () => void; opens?: boolean; tone?: "danger" }) {
  const focusRingStyle = useRing();
  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={(state) => [styles.listRow, state.pressed && styles.listRowPressed, focusStyle(state, focusRingStyle)]}
    >
      <View style={styles.listRowText}>
        <Text style={[styles.heading, tone === "danger" && styles.listRowDanger]}>{label}</Text>
        {hint ? <Text style={styles.caption}>{hint}</Text> : null}
      </View>
      {opens ? <View style={styles.arrow} aria-hidden /> : null}
    </Pressable>
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
    // The roundel's graphite stroke, as the radios beside it have (finish review, D116).
    borderWidth: size.roundelStroke,
    borderColor: color.sign,
    backgroundColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.sign, borderColor: color.sign },
  boxPressed: { borderColor: color.accent },
  // A drawn tick (two sides of a small box, turned), in points that don't grow with the
  // system text size: a ✓ glyph did, and at 1.3 on the phone it outgrew the box and was
  // cut off (stage 20e). Its stroke is the roundel's.
  tick: {
    width: size.checkbox * 0.3,
    height: size.checkbox * 0.5,
    marginTop: -size.checkbox * 0.125, // the turned shape sits low: lift it to the centre
    borderRightWidth: size.roundelStroke,
    borderBottomWidth: size.roundelStroke,
    borderColor: color.onSign,
    transform: [{ rotate: "45deg" }],
  },

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
  // Choices that are sentences (D112): full-width rows with a line under each, like the other lists.
  choiceList: { borderTopWidth: 1, borderTopColor: color.border },
  listChoice: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: color.border },
  listChoicePressed: { backgroundColor: color.surface },
  roundel: {
    width: size.roundel,
    height: size.roundel,
    borderRadius: size.roundel / 2,
    borderWidth: size.roundelStroke,
    borderColor: color.sign,
    backgroundColor: color.bg,
  },
  roundelOn: { backgroundColor: color.sign },

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
  plateTitle: { ...type.title },
  photoBox: { width: "100%", borderRadius: radius.plate, backgroundColor: color.surface, overflow: "hidden" },
  fill: { width: "100%", height: "100%" },

  // List rows (D108): a line under each, like the stops down a station list.
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touch.min + space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  listRowPressed: { backgroundColor: color.surface },
  listRowText: { flex: 1, gap: space.xs / 2 },
  listRowDanger: { color: color.danger },
  // The turned tick is wider than its own box: room for it before a chip's label (seen on the phone).
  chipTick: { width: size.checkbox * 0.6, alignItems: "center", justifyContent: "center" },
  // The screen's name in the top app bar once its title has scrolled away (D116).
  barTitle: { ...type.sign, color: color.onSign },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch.min },
  switchLabel: { flex: 1, minHeight: touch.min, justifyContent: "center" },
  // The web's switch at a 24-point height (48 wide): WCAG 2.5.8's minimum target.
  switchWeb: { height: 24 },
  // A drawn arrow: two sides of a small square, turned to point on.
  arrow: {
    width: space.sm,
    height: space.sm,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: color.sign,
    transform: [{ rotate: "45deg" }],
    marginRight: space.xs,
  },

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
