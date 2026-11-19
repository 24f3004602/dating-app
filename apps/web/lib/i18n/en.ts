import type { Messages } from "./types.ts";

/**
 * The landing page in English (stage 20d's words, D101-D104). Every station is
 * something the app already does and tests check (features.csv); nothing about
 * members, numbers or reviews, because there are none yet.
 */
export const en: Messages = {
  lang: "en",
  meta: {
    title: "",
    description: "Fewer, better introductions: a short daily set of people who want what you want.",
  },
  skip: "Skip to content",
  signIn: "Sign in",
  other: { lang: "hi", name: "हिन्दी" },
  headline: "Fewer, better introductions.",
  lede: "Up to 15 people a day, and only where what you want fits what they want, both ways.",
  map: {
    title: "A route map: your line and someone else's line meet at one interchange, only where both of you fit.",
    yourLine: "Your line",
    theirs: "Theirs",
    yourLineLong: "Your line: what you're looking for",
    theirsLong: "Theirs: what they're looking for",
    bothWays: "Fit both ways",
  },
  join: { heading: "Next stop: Delhi NCR", endHeading: "Start your line" },
  start: {
    create: "Create an account",
    signIn: "Sign in",
    note: "Free to join, for adults 18 and over. It opens in your browser, on a phone or a computer.",
  },
  route: {
    title: "How it works, stop by stop",
    legendLabel: "How to read the line",
    legend: { you: "Your line", them: "Theirs", rings: "Interchange: you fit each other", end: "End of the line" },
    towards: "Towards sign-up",
  },
  stations: [
    {
      interchange: true,
      title: "Fit both ways",
      body: "Your intentions are part of your profile, and they're required. Someone joins your line only if they fit what you want and you fit what they want: intentions, preferences and age, checked both ways.",
    },
    {
      title: "Up to 15 introductions a day",
      body: "The same set all day, a new one each day. No deck to swipe through.",
    },
    {
      title: "Ten likes a day, for everyone",
      body: "Every member gets the same ten. More likes are never for sale.",
    },
    {
      title: "Or meet live, on a one-minute call",
      body: "A short video call with someone who fits you both ways. Your first five calls are free, up to a minute each, and their video stays hidden until you choose to see it. Like each other afterwards and it's a match.",
    },
    {
      title: "Answer before you collect more",
      body: "When five people are waiting for your reply, new likes pause until you answer someone.",
    },
    {
      title: "Safety tools are free",
      body: "Block, report and unmatch from any profile or chat. People review reports, and every photo is checked before anyone sees it.",
    },
    {
      title: "Labels say only what we checked",
      body: "“Age declared” and “email verified”: exactly what was checked, never more.",
    },
    {
      title: "Your location stays vague",
      body: "Others see your area and a distance range, never where you are.",
    },
    {
      title: "Leave whenever you like",
      body: "Delete your account in the app. You're hidden at once, and everything is deleted after 7 days, apart from the safety records the privacy notice lists.",
    },
  ],
  terminus: {
    title: "Then, a conversation",
    body: "Chat opens only when you both like each other. That's where the line leads.",
  },
  pause: "Pause video",
  footer: {
    lead: (brand) => `${brand} is a working name. For the test:`,
    terms: "terms for testers",
    joiner: "and the",
    privacy: "privacy notice",
    close: ". Full documents will follow.",
  },
};
