import styles from "./landing.module.css";

/**
 * Into the app (the owner's request, 2026-11-19: "website ko bhi sahi karo jaise mobile
 * kaam kar raha"): sign-up is open to everyone (D133), so the landing page's panels lead
 * to the member app on the web (app.<domain>), the same app as on the phone, instead of
 * the waitlist. Plain links: they work without JavaScript.
 */
export function StartLinks({
  words,
  links,
  appLang,
}: {
  words: { create: string; signIn: string; note: string };
  links: { signUp: string; signIn: string };
  /** The app's language, where it isn't the page's (the Hindi page's links say so). */
  appLang?: string;
}) {
  return (
    <div className={styles.start}>
      <div className={styles.startButtons}>
        <a className={styles.plate} href={links.signUp} hrefLang={appLang}>
          {words.create}
        </a>
        <a className={styles.outline} href={links.signIn} hrefLang={appLang}>
          {words.signIn}
        </a>
      </div>
      <p className={styles.startNote}>{words.note}</p>
    </div>
  );
}
