import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { migrate } from "./migrate.js";
import { createSandboxProviders } from "./providers/index.js";

const cfg = loadConfig();
if (!cfg.SANDBOX) {
  // Production adapters (licensed SMS gateway, e-KYC vendor, partner-bank payout) must be wired here.
  throw new Error("SANDBOX=false requires real provider adapters in src/providers — not implemented yet");
}
const db = createPool(cfg.DATABASE_URL);
await migrate(cfg.DATABASE_URL);
const app = await buildApp({ cfg, db, providers: createSandboxProviders({ kycAutoApprove: cfg.KYC_AUTO_APPROVE }) });

const close = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", close);
process.on("SIGINT", close);

await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
