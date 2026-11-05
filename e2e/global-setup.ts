import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { apiEnv, PHOTO, RUN_DIR, WORKER_LOG } from "./env";

// A JPEG carrying GPS metadata, made with the API's own test helpers.
function makePhoto(api: string) {
  const code = [
    "import sys",
    "from tests.images import gps_exif, jpeg",
    "open(sys.argv[1], 'wb').write(jpeg((1600, 1200), exif=gps_exif()))",
  ].join("; ");
  const r = spawnSync(`uv run python -c "${code}" "${PHOTO}"`, { cwd: api, shell: true, stdio: "inherit" });
  if (r.status !== 0) throw new Error("could not create the photo fixture");
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const api = resolve(__dirname, "../apps/api");
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(RUN_DIR, { recursive: true });
  makePhoto(api);
  const env = { ...process.env, ...apiEnv(process.env.E2E_RUN_ID ?? "run"), PYTHONUNBUFFERED: "1" };
  // A fresh, migrated database for this run (see env.ts).
  for (const command of ["uv run python scripts/recreate_e2e_db.py", "uv run alembic upgrade head"]) {
    const done = spawnSync(command, { cwd: api, shell: true, env, stdio: "inherit" });
    if (done.status !== 0) throw new Error(`${command} failed`);
  }
  // Labelled development fixtures to be introduced to (idempotent).
  const seeded = spawnSync("uv run datingapp-api seed-dev", { cwd: api, shell: true, env, stdio: "inherit" });
  if (seeded.status !== 0) throw new Error("seed-dev failed");
  const log = openSync(WORKER_LOG, "w");
  const worker: ChildProcess = spawn("uv run datingapp-api worker", { cwd: api, shell: true, env, stdio: ["ignore", log, log] });
  return async () => {
    if (process.platform === "win32" && worker.pid) spawnSync(`taskkill /pid ${worker.pid} /T /F`, { shell: true });
    else worker.kill("SIGTERM");
  };
}
