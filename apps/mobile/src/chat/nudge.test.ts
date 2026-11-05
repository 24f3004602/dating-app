import { nudgeFor, words } from "@/chat/nudge";

// A slice of the API's lists; the same cases as apps/api/tests/test_messaging.py.
const terms = { version: "test", hurtful: ["idiot", "shut up", "kys"], money: ["upi", "transfer money"] };

test.each([
  ["You are such an IDIOT!", "hurtful"],
  ["ＩＤＩＯＴ", "hurtful"], // "IDIOT" in fullwidth letters (NFKC)
  ["just shut   up.", "hurtful"],
  ["Send me your UPI id?", "money"],
  ["can you transfer money to my account", "money"],
  ["idiot, send money on upi", "hurtful"], // hurtful wins
  ["Skyscrapers in Gurgaon", null],
  ["shutup", null],
  ["I love chai and long walks", null],
  ["नमस्ते दोस्त", null],
])("%s -> %s", (text, expected) => {
  expect(nudgeFor(text, terms)).toBe(expected);
});

test("Devanagari words keep their vowel signs", () => {
  expect(words("नमस्ते, दोस्त!")).toEqual(["नमस्ते", "दोस्त"]);
});

test("no list yet: no nudge", () => {
  expect(nudgeFor("idiot", undefined)).toBeNull();
});
