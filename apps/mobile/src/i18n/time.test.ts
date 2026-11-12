import { dateInIndia, dayInIndia, timeInIndia } from "@/i18n/time";

// 05:30 on 12 November in India.
const NOW = new Date("2026-11-12T00:00:00Z");

test("a day reads as people say it, on India's calendar (MOB-26)", () => {
  expect(dayInIndia("2026-11-11T19:00:00Z", NOW)).toBe("today"); // 00:30 in India: already the 12th
  expect(dayInIndia("2026-11-11T18:00:00Z", NOW)).toBe("yesterday"); // 23:30 on the 11th
  expect(dayInIndia("2026-11-04T09:00:00Z", NOW)).toBe("4 Nov");
  expect(dayInIndia("2025-12-31T19:00:00Z", NOW)).toBe("1 Jan"); // this year in India, last year in UTC
  expect(dayInIndia("2025-11-04T09:00:00Z", NOW)).toBe("4 Nov 2025");
});

test("the time and the full date are in India time too", () => {
  expect(timeInIndia("2026-11-11T19:00:00Z")).toBe("00:30");
  expect(dateInIndia("2026-11-11T19:00:00Z")).toBe("2026-11-12");
});
