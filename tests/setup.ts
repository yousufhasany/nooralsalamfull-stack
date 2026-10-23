import { TEST_DATABASE_URL } from "./config";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CHANNEL_MANAGER = "mock";
process.env.PAYMENT_PROVIDER = "none";
process.env.EMAIL_PROVIDER = "none";
(process.env as Record<string, string>).NODE_ENV = "test";
