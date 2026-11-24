/**
 * Complaints and the grievance officer (stage 28d, D155). India's IT Rules, 2021 make every
 * intermediary publish its grievance officer's name and contact and a way to complain, on a page
 * reachable from the website's home page (rule 3(2)(a) and its Explanation), and set how fast it
 * must act. The limits below are the rules as amended up to G.S.R. 120(E) of 10 February 2026,
 * read in MeitY's consolidated text on 2026-11-24; that amendment shortened three of them.
 * The page states them as the law's duties; launch-plan.md lists what keeping them takes.
 * No "server-only": Node's test runner loads this file directly.
 */
export const RULES_AMENDED = "10 February 2026";

export const LIMITS = {
  /** Rule 3(2)(a)(i): every complaint acknowledged. */
  acknowledge: "24 hours",
  /** Rule 3(2)(a)(i): resolved ("seven days" since 10 February 2026; fifteen before). */
  resolve: "7 days",
  /** Rule 3(2)(a)(i), proviso: a request to remove content rule 3(1)(b) forbids, other than
   * someone else's property, intellectual property or "any law" (36 hours since 10 February
   * 2026; 72 before). */
  removal: "36 hours",
  /** Rule 3(2)(b): content showing the complainant nude or in a sexual act, or impersonating
   * them, morphed images included (two hours since 10 February 2026; 24 before). */
  intimate: "2 hours",
  /** Rule 3A(3): an appeal to the Grievance Appellate Committee, from the officer's reply. */
  appeal: "30 days",
} as const;

/** The Grievance Appellate Committee's own site, where appeals are filed (rule 3A(6)). */
export const GAC_URL = "https://gac.gov.in";

/** What to put first in an email's subject for the two-hour kind, so it is seen first. */
export const URGENT_SUBJECT = "Urgent: image";
