/**
 * Starts a local, throw-away PostgreSQL server for development on machines
 * without Docker/PostgreSQL installed. NOT for production.
 *
 *   npm run db:local
 *
 * Default connection string:
 *   postgresql://postgres:postgres@localhost:54329/noor_al_salam
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const dataDir = path.resolve(process.cwd(), ".pgdata");
const dbName = process.env.LOCAL_PG_DB ?? "noor_al_salam";

async function main() {
  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    // Arabic / Bangla content requires UTF8 regardless of the host OS locale (Windows defaults to WIN1252).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) {
    await pg.createDatabase(dbName);
    if (process.env.LOCAL_PG_EXTRA_DB) {
      try {
        await pg.createDatabase(process.env.LOCAL_PG_EXTRA_DB);
      } catch {
        // already exists
      }
    }
  }

  const { Client } = await import("pg");
  const check = new Client({ connectionString: `postgresql://postgres:postgres@localhost:${port}/${dbName}` });
  await check.connect();
  const enc = await check.query("SHOW server_encoding");
  await check.end();
  const encoding = enc.rows[0]?.server_encoding;
  if (encoding !== "UTF8") {
    console.error(`This cluster is ${encoding}. Arabic and Bangla require UTF8.`);
    console.error("Stop this process, delete the .pgdata folder, and run `npm run db:local` again.");
    process.exit(1);
  }

  console.log(`PostgreSQL ready (UTF8): postgresql://postgres:postgres@localhost:${port}/${dbName}`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => undefined, 1 << 30);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
