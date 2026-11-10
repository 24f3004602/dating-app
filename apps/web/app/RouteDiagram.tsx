import styles from "./landing.module.css";

/**
 * The first screen's map (stage 20d, D101, D103): your line (teal) and someone else's
 * (marigold) meet at one interchange, drawn as the brand's two rings, and only there
 * do they run on together. Drawn, not an image; the words are real text.
 *
 * Two drawings, one shown at a time (CSS): a compact one for phones, where the line
 * arrives at the waitlist panel, and a tall one for wide screens, whose joined rails
 * run off its bottom edge straight into the station rails below. Those rails sit at
 * 12.5% and 14.75% of the map's width, and landing.module.css puts the station rails
 * at the same percentages of the same column, so the line is one line at any width.
 */
const TITLE = "A route map: your line and someone else's line meet at one interchange, only where both of you fit.";

export function RouteDiagram({ hindi }: { hindi: string }) {
  return (
    <>
      <svg className={[styles.map, styles.mapCompact].join(" ")} viewBox="0 0 400 196" role="img" aria-labelledby="map-compact">
        <title id="map-compact">{TITLE}</title>
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
          Your line · <tspan lang="hi">आपकी लाइन</tspan>
        </text>
        <text className={styles.mapSmall} x="384" y="60" textAnchor="end">
          Theirs · <tspan lang="hi">उनकी</tspan>
        </text>
        <text className={styles.mapLabel} x="244" y="148">
          Fit both ways
        </text>
        <text className={styles.mapHindi} x="244" y="174" lang="hi">
          {hindi}
        </text>
      </svg>

      <svg className={[styles.map, styles.mapTall].join(" ")} viewBox="0 0 400 470" role="img" aria-labelledby="map-tall">
        <title id="map-tall">{TITLE}</title>
        <path d="M 50 0 V 318" fill="none" stroke="var(--color-accent)" strokeWidth="6.4" />
        <path d="M 424 200 H 146 Q 84 200 68 262 L 59 304" fill="none" stroke="var(--color-highlight)" strokeWidth="6.4" />
        {/* The joined rails run past the bottom edge into the stations (overflow is visible). */}
        <path d="M 50 352 V 540" fill="none" stroke="var(--color-accent)" strokeWidth="6.4" />
        <path d="M 59 352 V 540" fill="none" stroke="var(--color-highlight)" strokeWidth="6.4" />
        {[70, 150].map((y) => (
          <circle key={y} cx="50" cy={y} r="8" fill="#ffffff" stroke="var(--color-text)" strokeWidth="3.5" />
        ))}
        {[330, 250].map((x) => (
          <circle key={x} cx={x} cy="200" r="8" fill="#ffffff" stroke="var(--color-text)" strokeWidth="3.5" />
        ))}
        <circle cx="43" cy="330" r="22" fill="#ffffff" stroke="var(--color-text)" strokeWidth="6.5" />
        <circle cx="66" cy="330" r="22" fill="none" stroke="var(--color-text)" strokeWidth="6.5" />
        <text className={styles.mapSmall} x="74" y="68">
          Your line: what you&apos;re looking for
        </text>
        <text className={styles.mapSmall} x="74" y="90" lang="hi">
          आपकी लाइन: आप क्या चाहते हैं
        </text>
        <text className={styles.mapSmall} x="396" y="160" textAnchor="end">
          Theirs: what they&apos;re looking for
        </text>
        <text className={styles.mapSmall} x="396" y="182" textAnchor="end" lang="hi">
          उनकी लाइन: वे क्या चाहते हैं
        </text>
        <text className={styles.mapLabelTall} x="104" y="338">
          Fit both ways
        </text>
        <text className={styles.mapHindiTall} x="104" y="370" lang="hi">
          {hindi}
        </text>
      </svg>
    </>
  );
}
