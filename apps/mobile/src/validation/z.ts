/**
 * Zod as the app uses it, set up for the web build's content security policy
 * before any schema exists (BUG-002).
 *
 * The policy's script-src has no 'unsafe-eval'. Unless `jitless` is on, Zod
 * tries `new Function("")` when the first object schema is built (to compile a
 * faster parser), and the browser reports the refused try as a violation on
 * every load. Zod reads the setting when each schema is created, not when it
 * parses, so every module that builds a schema imports `z` from here, never
 * from the package. z.test.ts checks the setting; the e2e suite fails on any
 * policy violation in the real build. Results are the same without the
 * compiled parser.
 */
import { z } from "zod";

z.config({ jitless: true });

export { z };
