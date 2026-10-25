import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const starts = [process.cwd()];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 4; i++) {
      const file = path.join(dir, ".env");
      if (existsSync(file)) {
        loadDotenv({ path: file });
        if (process.env.DATABASE_URL) return;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
}

function create(): PrismaClient {
  ensureDatabaseUrl();
  // Pooled app traffic. Prisma Migrate uses DATABASE_URL_UNPOOLED in prisma.config.ts.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    options: "-c client_encoding=UTF8",
  });
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.__prisma;
// After `prisma generate`, dev hot reload brings a new PrismaClient class; a client cached from the old
// class still has the old schema and rejects new columns, so replace it.
const current = cached instanceof PrismaClient ? cached : undefined;
if (cached && !current) void cached.$disconnect().catch(() => undefined);

export const db: PrismaClient = current ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = db;

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
/** Anything that can run queries: the root client or an interactive transaction. */
export type DbOrTx = Db | Tx;
