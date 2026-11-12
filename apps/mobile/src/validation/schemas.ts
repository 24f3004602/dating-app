/**
 * Client-side checks mirroring the API (which stays the authority): early,
 * friendly feedback, and fewer requests that are bound to fail.
 */
import { z } from "./z";

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;
export const ADULT_AGE = 18;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // India has no daylight saving

/** Code points after NFC, as the API counts them (NIST SP 800-63B-4). */
export function passwordLength(value: string): number {
  return [...value.normalize("NFC")].length;
}

export function todayInIndia(now: Date = new Date()): { year: number; month: number; day: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

export function ageOn(birth: { year: number; month: number; day: number }, today: { year: number; month: number; day: number }): number {
  const beforeBirthday = today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const email = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }));

export const password = z
  .string()
  .refine((v) => passwordLength(v) >= PASSWORD_MIN, { error: `Use at least ${PASSWORD_MIN} characters.` })
  .refine((v) => passwordLength(v) <= PASSWORD_MAX, { error: `Use at most ${PASSWORD_MAX} characters.` });

const digits = (label: string, len: number) =>
  z.string().trim().regex(new RegExp(`^\\d{1,${len}}$`), { error: `Enter the ${label} as a number.` });

export function makeSignUpSchema(now: () => Date = () => new Date()) {
  return z
    .object({
      email,
      password,
      day: digits("day", 2),
      month: digits("month", 2),
      year: digits("year", 4),
      terms: z.boolean().refine((v) => v, { error: "Accept the terms to continue." }),
      privacy: z.boolean().refine((v) => v, { error: "Confirm you have read the privacy notice." }),
    })
    .superRefine((v, ctx) => {
      const birth = { year: Number(v.year), month: Number(v.month), day: Number(v.day) };
      if (!isRealDate(birth.year, birth.month, birth.day) || birth.year < 1900) {
        ctx.addIssue({ code: "custom", path: ["day"], message: "Enter a real date of birth." });
        return;
      }
      const age = ageOn(birth, todayInIndia(now()));
      if (age < 0 || age > 120) {
        ctx.addIssue({ code: "custom", path: ["day"], message: "Enter a real date of birth." });
      } else if (age < ADULT_AGE) {
        ctx.addIssue({ code: "custom", path: ["day"], message: `You must be ${ADULT_AGE} or older to join.` });
      }
    });
}
export type SignUpValues = z.input<ReturnType<typeof makeSignUpSchema>>;

export function birthdateIso(v: { year: string; month: string; day: string }): string {
  return `${v.year.trim().padStart(4, "0")}-${v.month.trim().padStart(2, "0")}-${v.day.trim().padStart(2, "0")}`;
}

export const signInSchema = z.object({ email, password: z.string().min(1, { error: "Enter your password." }) });
export type SignInValues = z.input<typeof signInSchema>;

export const deleteAccountSchema = z.object({ password: z.string().min(1, { error: "Enter your password." }) });
export type DeleteAccountValues = z.input<typeof deleteAccountSchema>;

export const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, { error: "Enter the 6-digit code." }) });
export type CodeValues = z.input<typeof codeSchema>;

export const resetRequestSchema = z.object({ email });
export const resetConfirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, { error: "Enter the 6-digit code." }),
  newPassword: password,
});
export type ResetConfirmValues = z.input<typeof resetConfirmSchema>;

const LINK = /(https?:\/\/|www\.|\.(com|in|net|org|io|me)\b)/i;
export const displayName = z
  .string()
  .trim()
  .min(1, { error: "Enter your first name." })
  .max(40, { error: "Use at most 40 characters." })
  .refine((v) => !/\d/.test(v) && !v.includes("@") && !LINK.test(v), {
    error: "Names can't contain numbers, @ or links.",
  });

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export const INTENTS = ["marriage", "long_term", "figuring_out"] as const;

export const profileSchema = z.object({
  displayName,
  gender: z.enum(GENDERS, { error: "Choose one." }),
  interestedIn: z.array(z.enum(GENDERS)).min(1, { error: "Choose at least one." }),
  intent: z.enum(INTENTS, { error: "Choose what you're looking for." }),
  bio: z.string().max(500, { error: "Use at most 500 characters." }),
  areaId: z.string().min(1, { error: "Choose your area." }),
  prompts: z
    .array(
      z.object({
        key: z.string().min(1),
        answer: z.string().trim().min(1, { error: "Write an answer, or remove the prompt." }).max(200, { error: "Use at most 200 characters." }),
      }),
    )
    .max(3),
});
export type ProfileValues = z.input<typeof profileSchema>;
