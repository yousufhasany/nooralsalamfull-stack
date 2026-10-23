import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TEST_DATABASE_URL, TEST_DB_NAME, TEST_PG_PORT } from "./config";

/**
 * Starts a throw-away PostgreSQL (separate from the dev database), applies every migration with
 * `prisma migrate deploy` (so migrations are exercised by the test run) and tears it down afterwards.
 */
export default async function setup() {
  const dataDir = path.resolve(process.cwd(), ".pgdata-test");
  fs.rmSync(dataDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: TEST_PG_PORT,
    persistent: false,
    // Arabic / Bangla content requires UTF8 regardless of the host OS locale (Windows defaults to WIN1252).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(TEST_DB_NAME);

  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  return async () => {
    await pg.stop();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows may still hold the directory for a moment; it is wiped at the start of the next run.
    }
  };
}
