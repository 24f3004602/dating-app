import {
  ageOn,
  birthdateIso,
  displayName,
  email,
  makeSignUpSchema,
  passwordLength,
  todayInIndia,
} from "@/validation/schemas";

const base = { email: "A@Example.com", password: "violet harbour lantern seventy", terms: true, privacy: true };
// 19:00 UTC on 3 Nov 2026 is already 4 Nov in India.
const now = () => new Date(Date.UTC(2026, 10, 3, 19, 0));

describe("age gate", () => {
  test("today is the India date", () => {
    expect(todayInIndia(now())).toEqual({ year: 2026, month: 11, day: 4 });
  });

  test("18 today in India is accepted; 18 tomorrow is not", () => {
    const schema = makeSignUpSchema(now);
    expect(schema.safeParse({ ...base, day: "4", month: "11", year: "2008" }).success).toBe(true);
    const young = schema.safeParse({ ...base, day: "5", month: "11", year: "2008" });
    expect(young.success).toBe(false);
    expect(young.error?.issues[0]?.message).toBe("You must be 18 or older to join.");
  });

  test.each([
    ["31", "2", "1995"],
    ["1", "1", "1899"],
    ["1", "1", "2099"],
    ["x", "1", "1995"],
  ])("rejects an impossible date %s/%s/%s", (day, month, year) => {
    expect(makeSignUpSchema(now).safeParse({ ...base, day, month, year }).success).toBe(false);
  });

  test("birthdays before and after today in the year", () => {
    const today = { year: 2026, month: 11, day: 4 };
    expect(ageOn({ year: 2000, month: 11, day: 4 }, today)).toBe(26);
    expect(ageOn({ year: 2000, month: 11, day: 5 }, today)).toBe(25);
  });

  test("consents are required", () => {
    const r = makeSignUpSchema(now).safeParse({ ...base, terms: false, day: "1", month: "1", year: "1995" });
    expect(r.success).toBe(false);
  });
});

describe("fields", () => {
  test("email is trimmed and lowercased", () => {
    expect(email.parse("  Asha@Example.COM ")).toBe("asha@example.com");
    expect(email.safeParse("not-an-email").success).toBe(false);
  });

  test("password length counts code points, like the API", () => {
    expect(passwordLength("नमस्ते दोस्तों आप कै")).toBe(20);
    expect(passwordLength("é".repeat(14))).toBe(14); // NFC folds each pair into one
  });

  test("display names refuse contact details", () => {
    expect(displayName.safeParse("Asha").success).toBe(true);
    expect(displayName.safeParse("आशा").success).toBe(true);
    for (const bad of ["Asha 98765", "asha@example.com", "www.asha.in", ""]) {
      expect(displayName.safeParse(bad).success).toBe(false);
    }
  });

  test("birthdate is sent as ISO", () => {
    expect(birthdateIso({ year: "1995", month: "2", day: "9" })).toBe("1995-02-09");
  });
});
