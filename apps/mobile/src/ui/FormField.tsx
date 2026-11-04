import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import type { TextInputProps } from "react-native";

import { TextField } from "@/ui/primitives";

type Props<T extends FieldValues> = Omit<TextInputProps, "value" | "onChangeText"> & {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  error?: string;
};

export function FormField<T extends FieldValues>({ control, name, ...rest }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField {...rest} value={(field.value as string | undefined) ?? ""} onChangeText={field.onChange} onBlur={field.onBlur} />
      )}
    />
  );
}
