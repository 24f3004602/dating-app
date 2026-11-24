import { missingSettings } from "./lib/requiredSettings";

// The Node.js server's start (instrumentation.ts loads this only there): refuse to run without
// the settings that would otherwise fall back to this machine (D147).
const missing = missingSettings(process.env);
if (missing.length > 0) {
  console.error(`The website can't start without ${missing.join(" and ")} (infra/beta/compose.yaml sets them).`);
  process.exit(1);
}
