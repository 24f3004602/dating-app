/** The date of birth and the two documents (D110): every way of joining asks for them (D016, D134). */
import { type Control, Controller, type FieldErrors, type FieldPath, type FieldValues } from "react-hook-form";
import { StyleSheet, View } from "react-native";

import { DOCUMENT_LINKS } from "@/config";
import { t } from "@/i18n/en";
import { space } from "@/theme/tokens";
import { FormField } from "@/ui/FormField";
import { Caption, Checkbox, ExternalLink, FieldError, Label, Row } from "@/ui/primitives";

type BirthAndConsents = { day: string; month: string; year: string; terms: boolean; privacy: boolean };

export function BirthAndConsentFields<T extends FieldValues>({
  control,
  errors,
}: {
  control: Control<T>;
  errors: FieldErrors<BirthAndConsents>;
}) {
  // Every form that uses these fields has them under these names.
  const name = (key: keyof BirthAndConsents) => key as FieldPath<T>;
  return (
    <>
      {/* The date is one labelled group of three fields, with a hint like a field's own (D110). */}
      <View role="group" aria-label={t.signUp.birthdate} style={styles.group}>
        <Label>{t.signUp.birthdate}</Label>
        <Caption>{t.signUp.birthdateHint}</Caption>
        <Row>
          <View style={styles.part}>
            <FormField control={control} name={name("day")} label={t.signUp.day} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
          </View>
          <View style={styles.part}>
            <FormField control={control} name={name("month")} label={t.signUp.month} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
          </View>
          <View style={styles.year}>
            <FormField control={control} name={name("year")} label={t.signUp.year} keyboardType="number-pad" inputMode="numeric" maxLength={4} />
          </View>
        </Row>
        <FieldError message={errors.day?.message ?? errors.month?.message ?? errors.year?.message} />
      </View>
      {/* Each consent keeps its document close: the link to read, then the box to tick. */}
      <View style={styles.consent}>
        <ExternalLink label={t.signUp.readTerms} url={DOCUMENT_LINKS.terms} />
        <Controller control={control} name={name("terms")} render={({ field }) => (
          <Checkbox label={t.signUp.terms} checked={!!field.value} onChange={field.onChange} error={errors.terms?.message} />
        )} />
      </View>
      <View style={styles.consent}>
        <ExternalLink label={t.signUp.readPrivacy} url={DOCUMENT_LINKS.privacy} />
        <Controller control={control} name={name("privacy")} render={({ field }) => (
          <Checkbox label={t.signUp.privacy} checked={!!field.value} onChange={field.onChange} error={errors.privacy?.message} />
        )} />
      </View>
    </>
  );
}

// A group of fields keeps a field's own rhythm; a consent keeps its link close (D110).
const styles = StyleSheet.create({
  group: { gap: space.xs },
  consent: { gap: space.sm },
  part: { flex: 1 },
  year: { flex: 2 },
});
