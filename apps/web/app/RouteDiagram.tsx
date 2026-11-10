import styles from "./landing.module.css";

/**
 * The first screen's map (stage 20d, D101): your line (teal) and someone else's
 * (marigold) meet at one interchange, drawn as the brand's two rings, and only
 * there do they run on together. Drawn, not an image; the words are real text.
 */
export function RouteDiagram({ hindi }: { hindi: string | null }) {
  return (
    <svg
      className={styles.map}
      viewBox="0 0 400 196"
      role="img"
      aria-labelledby="route-map-title"
    >
      <title id="route-map-title">
        A route map: your line and someone else&apos;s line meet at one interchange, only where both of you fit.
      </title>
      <path d="M -24 44 H 118 Q 154 44 168 82 L 180 116" fill="none" stroke="var(--color-accent)" strokeWidth="10" />
      <path d="M 424 80 H 286 Q 250 80 236 106 L 224 124" fill="none" stroke="var(--color-highlight)" strokeWidth="10" />
      <path d="M 191 150 V 214" fill="none" stroke="var(--color-accent)" strokeWidth="10" />
      <path d="M 205 150 V 214" fill="none" stroke="var(--color-highlight)" strokeWidth="10" />
      {[44, 92].map((x) => (
        <circle key={x} cx={x} cy="44" r="8" fill="#ffffff" stroke="var(--color-text)" strokeWidth="4" />
      ))}
      {[358, 310].map((x) => (
        <circle key={x} cx={x} cy="80" r="8" fill="#ffffff" stroke="var(--color-text)" strokeWidth="4" />
      ))}
      <circle cx="186" cy="134" r="22" fill="#ffffff" stroke="var(--color-text)" strokeWidth="7" />
      <circle cx="210" cy="134" r="22" fill="none" stroke="var(--color-text)" strokeWidth="7" />
      <text className={styles.mapSmall} x="18" y="24">
        Your line
      </text>
      <text className={styles.mapSmall} x="384" y="60" textAnchor="end">
        Theirs
      </text>
      <text className={styles.mapLabel} x="244" y="148">
        Fit both ways
      </text>
      {hindi && (
        <text className={styles.mapHindi} x="244" y="174" lang="hi">
          {hindi}
        </text>
      )}
    </svg>
  );
}
