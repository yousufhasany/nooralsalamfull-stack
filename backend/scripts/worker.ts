/**
 * Background worker: expires unpaid holds, polls connected channels, pushes inventory/rates and
 * retries failed jobs with backoff.
 *
 *   npm run worker
 *
 * Alternatives: call POST /api/jobs/run from a cron service (see JOBS_SECRET in .env.example).
 */
import "dotenv/config";
import { runDueJobs, runScheduler } from "../src/server/services/channel-sync.service";
import { purgeExpiredHousekeepingPhotos } from "../src/server/services/housekeeping-clean.service";

const JOB_TICK_MS = Number(process.env.WORKER_JOB_INTERVAL_MS ?? 15_000);
const SCHEDULER_TICK_MS = Number(process.env.WORKER_SCHEDULER_INTERVAL_MS ?? 5 * 60_000);

let stopping = false;

async function safe(name: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    if (out && typeof out === "object" && Object.values(out).some((v) => typeof v === "number" && v > 0)) {
      console.log(`[worker] ${name}`, out);
    }
  } catch (e) {
    console.error(`[worker] ${name} failed`, e);
  }
}

async function main() {
  console.log("[worker] started");
  let lastScheduler = 0;
  while (!stopping) {
    if (Date.now() - lastScheduler >= SCHEDULER_TICK_MS) {
      await safe("scheduler", () => runScheduler());
      await safe("photo-retention", () => purgeExpiredHousekeepingPhotos());
      lastScheduler = Date.now();
    }
    await safe("jobs", () => runDueJobs(50));
    await new Promise((r) => setTimeout(r, JOB_TICK_MS));
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    console.log("[worker] stopping...");
    setTimeout(() => process.exit(0), 1500);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
