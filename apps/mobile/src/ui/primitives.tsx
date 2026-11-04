/**
 * Accessible primitives. Every control has a role, a label and its state;
 * touch targets are at least 44 points; only design tokens, no raw values.
 */
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { color, font, radius, size, space, touch } from "@/theme/tokens";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      {/* Focusable on web so keyboard users can scroll screens without controls (WCAG 2.1.1; found by axe). */}
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" focusable={Platform.OS === "web"}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text role="heading" style={styles.title}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text role="heading" style={styles.heading}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
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
  const inactive = disabled || busy;
  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityHint={hint}
      aria-disabled={!!inactive}
      aria-busy={!!busy}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.dangerButton,
        (pressed || inactive) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" ? color.onPrimary : color.primary} />
      ) : (
        <Text style={[styles.buttonText, variant !== "primary" && styles.buttonTextAlt, variant === "danger" && styles.dangerText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, style, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        aria-label={label}
        accessibilityHint={hint}
        aria-disabled={input.editable === false}
        aria-invalid={!!error}
        placeholderTextColor={color.muted}
        style={[styles.input, !!error && styles.inputError, style]}
        {...input}
      />
      <FieldError message={error} />
    </View>
  );
}

export function FieldError({ message }: { message?: string }) {
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
        style={styles.choiceRow}
      >
        <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
        <Text style={styles.body}>{label}</Text>
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
        {props.options.map((o) => (
          <Pressable
            key={o.value}
            role={props.multiple ? "checkbox" : "radio"}
            aria-label={o.label}
            aria-checked={selected(o.value)}
            onPress={() => toggle(o.value)}
            style={[styles.chip, selected(o.value) && styles.chipOn]}
          >
            <Text style={[styles.chipText, selected(o.value) && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <FieldError message={props.error} />
    </View>
  );
}

export function Notice({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  return (
    <View
      role={kind === "error" ? "alert" : undefined}
      aria-live="polite"
      style={[styles.notice, kind === "error" && styles.noticeError, kind === "success" && styles.noticeSuccess]}
    >
      <Text style={[styles.body, kind === "error" && styles.errorText, kind === "success" && styles.successText]}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center} aria-label={label} role="progressbar" aria-busy>
      <ActivityIndicator color={color.primary} />
      <Text style={[styles.body, styles.muted]}>{label}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.surface },
  screen: { padding: space.xl, gap: space.lg, maxWidth: size.contentMax, width: "100%", alignSelf: "center" },
  title: { fontSize: font.title, fontWeight: "700", color: color.text },
  heading: { fontSize: font.heading, fontWeight: "600", color: color.text, marginTop: space.md },
  body: { fontSize: font.body, color: color.text, lineHeight: font.body * 1.4, flexShrink: 1 },
  muted: { color: color.muted },
  button: {
    minHeight: touch.min,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.primary,
  },
  primary: { backgroundColor: color.primary },
  secondary: { backgroundColor: color.surface },
  dangerButton: { backgroundColor: color.surface, borderColor: color.danger },
  dim: { opacity: 0.6 },
  buttonText: { color: color.onPrimary, fontSize: font.body, fontWeight: "600" },
  buttonTextAlt: { color: color.primary },
  dangerText: { color: color.danger },
  field: { gap: space.xs },
  label: { fontSize: font.label, fontWeight: "600", color: color.text },
  hint: { fontSize: font.small, color: color.muted },
  input: {
    minHeight: touch.min,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: font.body,
    color: color.text,
    backgroundColor: color.surface,
  },
  inputError: { borderColor: color.danger, borderWidth: 2 },
  error: { fontSize: font.small, color: color.danger },
  errorText: { color: color.danger },
  successText: { color: color.success },
  choiceRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch.min },
  box: {
    width: size.checkbox,
    height: size.checkbox,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.primary, borderColor: color.primary },
  tick: { color: color.onPrimary, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: touch.min,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { fontSize: font.body, color: color.text },
  chipTextOn: { color: color.onPrimary, fontWeight: "600" },
  notice: { padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceAlt },
  noticeError: { borderWidth: 1, borderColor: color.danger },
  noticeSuccess: { borderWidth: 1, borderColor: color.success },
  center: { alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xxl },
  row: { flexDirection: "row", gap: space.md, alignItems: "center", flexWrap: "wrap" },
});
