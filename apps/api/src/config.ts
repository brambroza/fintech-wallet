import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  OTP_PEPPER: z.string().min(16),
  CORS_ORIGIN: z.string().default("*"),
  ACCESS_TTL_SEC: z.coerce.number().default(15 * 60),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  /** Sandbox mode: mock SMS/KYC/payout providers + /sandbox routes. Must be false in production. */
  SANDBOX: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  /** Return OTP code in API response (sandbox only, for demo/testing). */
  SANDBOX_EXPOSE_OTP: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  KYC_AUTO_APPROVE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** Per-user daily outgoing limit in satang (default ฿50,000). */
  DAILY_LIMIT: z.coerce.number().int().positive().default(5_000_000),
  /** Fee for transfers out to bank/PromptPay in satang. */
  PAYOUT_FEE: z.coerce.number().int().min(0).default(0),
  /** GO Along operator token for /v1/admin (create orgs). Unset = admin routes disabled. */
  ADMIN_TOKEN: z.string().min(24).optional(),
  /** LINE Login channel id; required to verify LIFF id tokens outside the sandbox. */
  LINE_CHANNEL_ID: z.string().optional(),
  /** Charge QR lifetime. */
  CHARGE_TTL_SEC: z.coerce.number().int().positive().default(180),
  /** Consumer P2P wallet routes from the first MVP (self-register, KYC, bank payout). Off for the canteen product. */
  CONSUMER_WALLET: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** console = log OTPs (sandbox only); thaibulksms = real SMS. */
  SMS_PROVIDER: z.enum(["console", "thaibulksms"]).default("console"),
  THAIBULKSMS_API_KEY: z.string().optional(),
  THAIBULKSMS_API_SECRET: z.string().optional(),
  THAIBULKSMS_SENDER: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = schema.parse(env);
  if (cfg.NODE_ENV === "production" && cfg.SANDBOX_EXPOSE_OTP) {
    throw new Error("SANDBOX_EXPOSE_OTP must be false in production");
  }
  if (!cfg.SANDBOX && cfg.SMS_PROVIDER === "console") {
    throw new Error("SANDBOX=false needs a real SMS_PROVIDER (OTPs would never reach users)");
  }
  if (cfg.SMS_PROVIDER === "thaibulksms" && !(cfg.THAIBULKSMS_API_KEY && cfg.THAIBULKSMS_API_SECRET && cfg.THAIBULKSMS_SENDER)) {
    throw new Error("SMS_PROVIDER=thaibulksms needs THAIBULKSMS_API_KEY, THAIBULKSMS_API_SECRET and THAIBULKSMS_SENDER");
  }
  return cfg;
}
