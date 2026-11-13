import type { Messages } from "@/lib/i18n";
import { COMPACT, type MapLayout, pathD, TALL } from "@/lib/routeMap";

import { HeroMap } from "./HeroMap";
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
 *
 * The shapes come from lib/routeMap.ts, which the 3D scene reads too (stage 21a, D119).
 * When the scene is showing, it draws everything inside the map's box: the shapes here
 * are clipped to what runs outside the box, the flat rings fade out under the 3D ones,
 * and the words stay on top.
 *
 * The words are in the page's one language (stage 22a, D120), one line per label: each
 * sits centred where its English and Hindi pair used to.
 */
const STROKE = { teal: "var(--color-accent)", marigold: "var(--color-highlight)" } as const;

export function RouteDiagram({ words, scene }: { words: Messages["map"]; scene: boolean }) {
  return (
    <HeroMap
      scene={scene}
      compact={
        <svg className={styles.map} viewBox={`0 0 ${COMPACT.width} ${COMPACT.height}`} role="img" aria-labelledby="map-compact">
          <title id="map-compact">{words.title}</title>
          <Shapes map={COMPACT} id="map-compact-outside" />
          <text className={styles.mapSmall} x="18" y="24">
            {words.yourLine}
          </text>
          <text className={styles.mapSmall} x="384" y="60" textAnchor="end">
            {words.theirs}
          </text>
          <text className={styles.mapLabel} x="244" y="141">
            {words.bothWays}
          </text>
        </svg>
      }
      tall={
        <svg className={styles.map} viewBox={`0 0 ${TALL.width} ${TALL.height}`} role="img" aria-labelledby="map-tall">
          <title id="map-tall">{words.title}</title>
          {/* The joined rails run past the bottom edge into the stations (overflow is visible). */}
          <Shapes map={TALL} id="map-tall-outside" />
          <text className={styles.mapSmall} x="74" y="75">
            {words.yourLineLong}
          </text>
          <text className={styles.mapSmall} x="396" y="180" textAnchor="end">
            {words.theirsLong}
          </text>
          <text className={styles.mapLabelTall} x="104" y="341">
            {words.bothWays}
          </text>
        </svg>
      }
    />
  );
}

/**
 * The lines, stations and rings. `id` names the clip that keeps only what lies outside
 * the box, plus a band 2 units inside its edge: the canvas can end a fraction of a pixel
 * short of a box that is a fractional number of pixels tall, and there the 3D lines are
 * still flat, so the flat strokes laid over them cover the gap without a seam.
 */
function Shapes({ map, id }: { map: MapLayout; id: string }) {
  const { minX, maxX, minY, maxY } = map.extent;
  const band = 2;
  const outside =
    `M ${minX - 100} ${minY - 100} H ${maxX + 100} V ${maxY + 100} H ${minX - 100} Z ` +
    `M ${band} ${band} V ${map.height - band} H ${map.width - band} V ${band} Z`;
  return (
    <>
      <defs>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <path d={outside} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g className={styles.mapShapes}>
        {[...map.lines, ...map.rails].map((line) => (
          <path key={pathD(line.d)} d={pathD(line.d)} fill="none" stroke={STROKE[line.tone]} strokeWidth={map.lineWidth} />
        ))}
        {map.stations.map((s) => (
          <circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={map.stationRadius} fill="#ffffff" stroke="var(--color-text)" strokeWidth={map.stationStroke} />
        ))}
      </g>
      <g className={styles.mapRings}>
        <circle cx={map.rings[0].x} cy={map.rings[0].y} r={map.ringRadius} fill="#ffffff" stroke="var(--color-text)" strokeWidth={map.ringStroke} />
        <circle cx={map.rings[1].x} cy={map.rings[1].y} r={map.ringRadius} fill="none" stroke="var(--color-text)" strokeWidth={map.ringStroke} />
      </g>
    </>
  );
}
