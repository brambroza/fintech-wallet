import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { migrate } from "./migrate.js";
import { createSandboxProviders } from "./providers/index.js";
import { LineMessagingNotifier } from "./providers/line.js";
import { ThaiBulkSms } from "./providers/thaibulksms.js";

const cfg = loadConfig();
const db = createPool(cfg.DATABASE_URL);
await migrate(cfg.DATABASE_URL);
const providers = createSandboxProviders({ kycAutoApprove: cfg.KYC_AUTO_APPROVE, lineChannelId: cfg.LINE_CHANNEL_ID });
if (cfg.SMS_PROVIDER === "thaibulksms") {
  providers.sms = new ThaiBulkSms(cfg.THAIBULKSMS_API_KEY!, cfg.THAIBULKSMS_API_SECRET!, cfg.THAIBULKSMS_SENDER!);
}
if (cfg.LINE_MESSAGING_TOKEN) providers.notify = new LineMessagingNotifier(cfg.LINE_MESSAGING_TOKEN);
if (cfg.CONSUMER_WALLET && !cfg.SANDBOX) {
  // KYC vendor and bank payout adapters are sandbox-only; never run the consumer wallet with real money.
  throw new Error("CONSUMER_WALLET needs real KYC/payout adapters before SANDBOX=false");
}
const app = await buildApp({ cfg, db, providers });

const close = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", close);
process.on("SIGINT", close);

await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
