import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma Migrate needs a direct connection. The app uses pooled DATABASE_URL.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || env("DATABASE_URL");

export default defineConfig({
  schema: "backend/prisma/schema.prisma",
  migrations: {
    path: "backend/prisma/migrations",
    seed: "tsx backend/prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
