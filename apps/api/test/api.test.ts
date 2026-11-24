import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPool, type Db } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createSandboxProviders, SandboxSms } from "../src/providers/index.js";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5433/wallet_test";

let app: FastifyInstance;
let db: Db;
let sms: SandboxSms;

const req = async (method: string, url: string, body?: unknown, token?: string) => {
  const r = await app.inject({
    method: method as "GET",
    url: `/v1${url}`,
    payload: body as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: r.statusCode, body: r.json() };
};

const lastOtp = (phone: string) => {
  const m = [...sms.outbox].reverse().find((x) => x.phone === phone)!;
  return m.message.match(/\d{6}/)![0];
};

async function register(phone: string, name: string, deviceId = `dev-${phone}`) {
  const o = await req("POST", "/auth/register/otp", { phone, deviceId });
  expect(o.status).toBe(200);
  const r = await req("POST", "/auth/register", { otpId: o.body.otpId, code: lastOtp(phone), pin: "135790", deviceId, displayName: name });
  expect(r.status).toBe(200);
  return r.body as { accessToken: string; refreshToken: string };
}

async function approveKyc(phone: string, token: string) {
  const big = "x".repeat(200);
  expect((await req("POST", "/kyc/submit", { method: "id_card", idCardImage: big, selfieImage: big }, token)).body.status).toBe("pending");
  expect((await req("POST", "/sandbox/kyc/decide", { phone, decision: "approved" })).status).toBe(200);
}

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await admin.end();
  await migrate(DATABASE_URL);
  db = createPool(DATABASE_URL);
  const cfg = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL,
    JWT_SECRET: "test-secret-test-secret-test-secret-123",
    OTP_PEPPER: "pepper-pepper-123",
    DAILY_LIMIT: "1000000",
    CONSUMER_WALLET: "true",
  } as NodeJS.ProcessEnv);
  const providers = createSandboxProviders({ kycAutoApprove: false });
  sms = providers.sms as SandboxSms;
  app = await buildApp({ cfg, db, providers });
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe("auth", () => {
  it("registers, rejects duplicate phone and weak PIN", async () => {
    await register("0812345671", "Alice");
    const dup = await req("POST", "/auth/register/otp", { phone: "0812345671", deviceId: "dev-xxxxxx" });
    expect(dup.body.error.code).toBe("PHONE_TAKEN");

    const o = await req("POST", "/auth/register/otp", { phone: "0812345679", deviceId: "dev-weak-1" });
    const weak = await req("POST", "/auth/register", { otpId: o.body.otpId, code: lastOtp("0812345679"), pin: "123456", deviceId: "dev-weak-1", displayName: "W" });
    expect(weak.body.error.code).toBe("PIN_WEAK");
  });

  it("requires OTP on a new device and trusts it afterwards", async () => {
    const first = await req("POST", "/auth/login", { phone: "081-234-5671", pin: "135790", deviceId: "dev-0812345671" });
    expect(first.body.otpRequired).toBe(false);

    const nd = await req("POST", "/auth/login", { phone: "0812345671", pin: "135790", deviceId: "new-device-1" });
    expect(nd.body.otpRequired).toBe(true);
    const bad = await req("POST", "/auth/login/verify", { otpId: nd.body.otpId, code: "000000", deviceId: "new-device-1" });
    expect(bad.body.error.code).toBe("OTP_INVALID");
    const ok = await req("POST", "/auth/login/verify", { otpId: nd.body.otpId, code: lastOtp("0812345671"), deviceId: "new-device-1" });
    expect(ok.body.accessToken).toBeTruthy();
    const reuse = await req("POST", "/auth/login/verify", { otpId: nd.body.otpId, code: lastOtp("0812345671"), deviceId: "new-device-1" });
    expect(reuse.body.error.code).toBe("OTP_EXPIRED");
  });

  it("locks PIN after 5 wrong attempts", async () => {
    await register("0812345672", "Bob");
    for (let i = 0; i < 4; i++) {
      const r = await req("POST", "/auth/login", { phone: "0812345672", pin: "000001", deviceId: "dev-0812345672" });
      expect(r.body.error.code).toBe("PIN_INVALID");
    }
    const locked = await req("POST", "/auth/login", { phone: "0812345672", pin: "000001", deviceId: "dev-0812345672" });
    expect(locked.status).toBe(423);
    const evenRight = await req("POST", "/auth/login", { phone: "0812345672", pin: "135790", deviceId: "dev-0812345672" });
    expect(evenRight.status).toBe(423);
    await db.query("UPDATE users SET pin_locked_until = NULL WHERE phone = '0812345672'");
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const t = await register("0812345673", "Carol");
    const r1 = await req("POST", "/auth/refresh", { refreshToken: t.refreshToken, deviceId: "dev-0812345673" });
    expect(r1.status).toBe(200);
    const replay = await req("POST", "/auth/refresh", { refreshToken: t.refreshToken, deviceId: "dev-0812345673" });
    expect(replay.body.error.code).toBe("REFRESH_REUSED");
    const after = await req("POST", "/auth/refresh", { refreshToken: r1.body.refreshToken, deviceId: "dev-0812345673" });
    expect(after.status).toBe(401);
  });
});

describe("wallet", () => {
  let alice: string;
  let dave: string;

  beforeAll(async () => {
    alice = (await req("POST", "/auth/login", { phone: "0812345671", pin: "135790", deviceId: "dev-0812345671" })).body.accessToken;
    dave = (await register("0812345674", "Dave")).accessToken;
  });

  it("blocks money movement until KYC is approved", async () => {
    const r = await req("POST", "/wallet/topup", { amount: 100_00, idempotencyKey: "topup-a-0" }, alice);
    expect(r.body.error.code).toBe("KYC_REQUIRED");
    await approveKyc("0812345671", alice);
    await approveKyc("0812345674", dave);
  });

  it("tops up idempotently", async () => {
    const a = await req("POST", "/wallet/topup", { amount: 5_000_00, idempotencyKey: "topup-a-1" }, alice);
    const b = await req("POST", "/wallet/topup", { amount: 5_000_00, idempotencyKey: "topup-a-1" }, alice);
    expect(a.body.id).toBe(b.body.id);
    expect((await req("GET", "/me", undefined, alice)).body.balance).toBe(5_000_00);
  });

  it("transfers wallet to wallet with PIN, and rejects overdraft", async () => {
    const q = await req("POST", "/transfers/quote", { to: { kind: "wallet", phone: "0812345674" }, amount: 1_500_00 }, alice);
    expect(q.body.to.name).toBe("Dave");
    const wrongPin = await req("POST", "/transfers", { to: { kind: "wallet", phone: "0812345674" }, amount: 1_500_00, pin: "999999", idempotencyKey: "transfer-1" }, alice);
    expect(wrongPin.body.error.code, JSON.stringify(wrongPin.body)).toBe("PIN_INVALID");
    const ok = await req("POST", "/transfers", { to: { kind: "wallet", phone: "0812345674" }, amount: 1_500_00, pin: "135790", note: "ค่าข้าว", idempotencyKey: "transfer-1" }, alice);
    expect(ok.body.status).toBe("completed");
    expect((await req("GET", "/me", undefined, dave)).body.balance).toBe(1_500_00);

    const over = await req("POST", "/transfers", { to: { kind: "wallet", phone: "0812345674" }, amount: 5_000_00, pin: "135790", idempotencyKey: "transfer-2" }, alice);
    expect(over.body.error.code).toBe("INSUFFICIENT_FUNDS");
    expect((await req("GET", "/me", undefined, alice)).body.balance).toBe(3_500_00);

    const dHist = await req("GET", "/wallet/transactions", undefined, dave);
    expect(dHist.body.items[0].counterparty.name).toBe("Alice");
    expect(dHist.body.items[0].direction).toBe("in");
  });

  it("reverses a failed bank payout", async () => {
    const r = await req("POST", "/transfers", { to: { kind: "bank", bankCode: "KBANK", accountNo: "1234569999" }, amount: 500_00, pin: "135790", idempotencyKey: "transfer-3" }, alice);
    expect(r.body.status, JSON.stringify(r.body)).toBe("failed");
    expect((await req("GET", "/me", undefined, alice)).body.balance).toBe(3_500_00);
    const ok = await req("POST", "/transfers", { to: { kind: "promptpay", id: "0899999991" }, amount: 500_00, pin: "135790", idempotencyKey: "transfer-4" }, alice);
    expect(ok.body.status).toBe("completed");
    expect((await req("GET", "/me", undefined, alice)).body.balance).toBe(3_000_00);
  });

  it("enforces the daily limit", async () => {
    await req("POST", "/wallet/topup", { amount: 20_000_00, idempotencyKey: "topup-a-2" }, alice);
    const r = await req("POST", "/transfers", { to: { kind: "wallet", phone: "0812345674" }, amount: 9_000_00, pin: "135790", idempotencyKey: "transfer-5" }, alice);
    expect(r.body.error.code).toBe("DAILY_LIMIT");
  });

  it("moves money into and out of a savings goal", async () => {
    const g = await req("POST", "/goals", { name: "เที่ยวญี่ปุ่น", target: 40_000_00 }, alice);
    const d = await req("POST", `/goals/${g.body.id}/move`, { amount: 1_000_00, direction: "deposit" }, alice);
    expect(d.body.saved).toBe(1_000_00);
    const w = await req("POST", `/goals/${g.body.id}/move`, { amount: 5_000_00, direction: "withdraw" }, alice);
    expect(w.body.error.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("keeps the ledger balanced and matching account balances", async () => {
    const unbalanced = await db.query("SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount) <> 0");
    expect(unbalanced.rowCount).toBe(0);
    const drift = await db.query(
      "SELECT a.id FROM accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id GROUP BY a.id, a.balance HAVING a.balance <> COALESCE(SUM(e.amount), 0)",
    );
    expect(drift.rowCount).toBe(0);
  });

  it("survives concurrent transfers without overdraft", async () => {
    const bal = (await req("GET", "/me", undefined, dave)).body.balance; // 1,500.00
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        req("POST", "/transfers", { to: { kind: "wallet", phone: "0812345671" }, amount: 400_00, pin: "135790", idempotencyKey: `concurrent-${i}` }, dave),
      ),
    );
    const done = results.filter((r) => r.body.status === "completed").length;
    expect(done).toBe(Math.floor(bal / 400_00));
    expect((await req("GET", "/me", undefined, dave)).body.balance).toBe(bal - done * 400_00);
  });
});
