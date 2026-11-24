import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPool, type Db } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createSandboxProviders, SandboxSms } from "../src/providers/index.js";
import type { SandboxLineNotifier } from "../src/providers/line.js";

const DATABASE_URL = process.env.TEST_DATABASE_URL_CANTEEN ?? "postgres://postgres@localhost:5433/wallet_test_canteen";
const ADMIN = "admin-token-admin-token-123456";

let app: FastifyInstance;
let db: Db;
let sms: SandboxSms;
let line: SandboxLineNotifier;

const req = async (method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => {
  const r = await app.inject({
    method: method as "GET",
    url: `/v1${url}`,
    payload: body as object,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: r.statusCode, body: r.json() };
};
const lastOtp = (phone: string) => [...sms.outbox].reverse().find((x) => x.phone === phone)!.message.match(/\d{6}/)![0];

async function activate(phone: string, pin = "135790") {
  const deviceId = `dev-${phone}`;
  const o = await req("POST", "/auth/activate/otp", { phone, deviceId });
  expect(o.status, JSON.stringify(o.body)).toBe(200);
  const r = await req("POST", "/auth/activate", { otpId: o.body.otpId, code: lastOtp(phone), pin, deviceId });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.accessToken as string;
}

let hr: string, shop: string, somchai: string, merchantId: string;
const key = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: DATABASE_URL.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS wallet_test_canteen");
  await admin.query("CREATE DATABASE wallet_test_canteen");
  await admin.end();
  await migrate(DATABASE_URL);
  db = createPool(DATABASE_URL);
  const cfg = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL,
    JWT_SECRET: "test-secret-test-secret-test-secret-123",
    OTP_PEPPER: "pepper-pepper-123",
    ADMIN_TOKEN: ADMIN,
  } as NodeJS.ProcessEnv);
  const providers = createSandboxProviders({ kycAutoApprove: false });
  sms = providers.sms as SandboxSms;
  line = providers.notify as SandboxLineNotifier;
  app = await buildApp({ cfg, db, providers });
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe("canteen onboarding", () => {
  it("does not expose consumer self-registration or wallet routes", async () => {
    expect((await req("POST", "/auth/register/otp", { phone: "0899999999", deviceId: "dev-xxxxxxxx" })).status).toBe(404);
    expect((await req("POST", "/wallet/topup", { amount: 100, idempotencyKey: "xxxxxxxxxx" })).status).toBe(404);
  });

  it("admin creates an org with its first HR", async () => {
    const denied = await req("POST", "/admin/orgs", { name: "X", code: "XX", hr: { name: "a", phone: "0811111111" } });
    expect(denied.status).toBe(401);
    const r = await req("POST", "/admin/orgs", { name: "โรงงานทดสอบ", code: "TEST", moneyMode: "credit", hr: { name: "คุณเอ HR", phone: "0811111111" } }, undefined, {
      "x-admin-token": ADMIN,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    hr = await activate("0811111111");
    expect((await req("GET", "/org", undefined, hr)).body.moneyMode).toBe("credit");
  });

  it("HR imports employees (one badge-only) and a shop", async () => {
    await req("PATCH", "/org", { creditLimit: 200000, dailyLimit: 50000, welfareAmount: 30000 }, hr);
    const im = await req(
      "POST",
      "/org/employees/import",
      {
        employees: [
          { code: "E001", name: "สมชาย", department: "ผลิต", phone: "0822222222" },
          { code: "E002", name: "สมหญิง", department: "QC", phone: "" },
          { code: "E003", name: "ซ้ำเบอร์", phone: "0811111111" },
        ],
      },
      hr,
    );
    expect(im.body.created).toBe(2);
    // E003 shares the HR's phone: same person can be HR and employee → updated, not an error
    expect(im.body.errors).toEqual([]);
    const again = await req("POST", "/org/employees/import", { employees: [{ code: "E001", name: "สมชาย ใจดี", phone: "0822222222" }] }, hr);
    expect(again.body.updated).toBe(1);

    const m = await req("POST", "/org/merchants", { name: "ร้านป้าแดง", ownerName: "ป้าแดง", ownerPhone: "0833333333" }, hr);
    merchantId = m.body.id;
    shop = await activate("0833333333");
    somchai = await activate("0822222222");
    expect((await req("GET", "/org", undefined, somchai)).status).toBe(403);
  });
});

describe("canteen payments (credit mode)", () => {
  it("welfare run credits everyone once", async () => {
    const r = await req("POST", "/org/welfare/run", { cycle: "2026-12" }, hr);
    expect(r.body.employees).toBe(3);
    expect((await req("POST", "/org/welfare/run", { cycle: "2026-12" }, hr)).body.error.code).toBe("WELFARE_DONE");
    const me = await req("GET", "/canteen/me", undefined, somchai);
    expect(me.body.wallet.balance).toBe(30000);
    expect(me.body.wallet.available).toBe(230000);
  });

  it("pays a fixed-amount shop QR once, with PIN", async () => {
    const c = await req("POST", "/shop/charges", { amount: 4500 }, shop);
    const res = await req("POST", "/canteen/pay/resolve", { qr: c.body.qr }, somchai);
    expect(res.body).toMatchObject({ merchantName: "ร้านป้าแดง", amount: 4500 });
    const wrongAmt = await req("POST", "/canteen/pay", { merchantId, chargeId: c.body.chargeId, amount: 100, pin: "135790", idempotencyKey: key() }, somchai);
    expect(wrongAmt.body.error.code).toBe("AMOUNT_MISMATCH");
    const ok = await req("POST", "/canteen/pay", { merchantId, chargeId: c.body.chargeId, amount: 4500, pin: "135790", idempotencyKey: key() }, somchai);
    expect(ok.body.status).toBe("completed");
    const twice = await req("POST", "/canteen/pay", { merchantId, chargeId: c.body.chargeId, amount: 4500, pin: "135790", idempotencyKey: key() }, somchai);
    expect(twice.body.error.code).toBe("CHARGE_CLOSED");
    const st = await req("GET", `/shop/charges/${c.body.chargeId}`, undefined, shop);
    expect(st.body).toMatchObject({ status: "paid", payer: "สมชาย ใจดี" });
  });

  it("enforces daily limit and credit floor", async () => {
    const big = await req("POST", "/canteen/pay", { merchantId, amount: 50000, pin: "135790", idempotencyKey: key() }, somchai);
    expect(big.body.error.code).toBe("DAILY_LIMIT");
    await db.query("UPDATE orgs SET daily_limit = 10000000");
    const over = await req("POST", "/canteen/pay", { merchantId, amount: 300000, pin: "135790", idempotencyKey: key() }, somchai);
    expect(over.body.error.code).toBe("INSUFFICIENT_FUNDS");
    const toNeg = await req("POST", "/canteen/pay", { merchantId, amount: 100000, pin: "135790", idempotencyKey: key() }, somchai);
    expect(toNeg.body.status).toBe("completed");
    expect((await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance).toBe(30000 - 4500 - 100000);
  });

  it("badge-only employee pays at the shop with PIN typed there", async () => {
    const list = await req("GET", "/org/employees?q=E002", undefined, hr);
    const e2 = list.body[0];
    expect(e2.activated).toBe(false);
    const badge = await req("POST", `/org/employees/${e2.id}/badge`, {}, hr);
    const noPin = await req("POST", "/shop/badge-pay", { badge: badge.body.qr, amount: 2000, pin: "246810", idempotencyKey: key() }, shop);
    expect(noPin.body.error.code).toBe("NOT_ACTIVATED");
    await req("POST", `/org/employees/${e2.id}/pin`, { pin: "246810" }, hr);
    const ok = await req("POST", "/shop/badge-pay", { badge: badge.body.qr, amount: 2000, pin: "246810", idempotencyKey: key() }, shop);
    expect(ok.body.status, JSON.stringify(ok.body)).toBe("completed");
    const rotated = await req("POST", `/org/employees/${e2.id}/badge`, { rotate: true }, hr);
    const old = await req("POST", "/shop/badge-pay", { badge: badge.body.qr, amount: 2000, pin: "246810", idempotencyKey: key() }, shop);
    expect(old.body.error.code).toBe("BADGE_NOT_FOUND");
    expect(rotated.body.qr).not.toBe(badge.body.qr);
  });

  it("payroll export lists negatives and settling zeroes them", async () => {
    const p = await req("GET", "/org/payroll", undefined, hr);
    expect(p.body.items).toHaveLength(1);
    expect(p.body.items[0]).toMatchObject({ code: "E001", deduct: 74500 });
    const s = await req("POST", "/org/payroll/settle", { cycle: "2026-12", items: [{ memberId: p.body.items[0].memberId, amount: 74500 }] }, hr);
    expect(s.body.settled).toBe(74500);
    const again = await req("POST", "/org/payroll/settle", { cycle: "2026-12", items: [{ memberId: p.body.items[0].memberId, amount: 74500 }] }, hr);
    expect(again.body.settled).toBe(0);
    expect((await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance).toBe(0);
  });

  it("shop sees sales; HR pays the shop out; reports add up", async () => {
    const s = await req("GET", "/shop", undefined, shop);
    expect(s.body.today).toMatchObject({ count: 3, total: 106500 });
    expect(s.body.payable).toBe(106500);
    const po = await req("POST", `/org/merchants/${merchantId}/payout`, { amount: 106500, idempotencyKey: key() }, hr);
    expect(po.status).toBe(200);
    expect((await req("GET", "/shop", undefined, shop)).body.payable).toBe(0);
    const rep = await req("GET", `/org/reports/summary?from=${today()}&to=${today()}`, undefined, hr);
    expect(rep.body).toMatchObject({ count: 3, total: 106500, buyers: 2, shopsPayable: 0 });
    expect(rep.body.byShop[0]).toMatchObject({ name: "ร้านป้าแดง", total: 106500 });
  });

  it("prepaid mode blocks spending below zero; HR desk top-up works", async () => {
    await req("PATCH", "/org", { moneyMode: "prepaid" }, hr);
    const me = await req("GET", "/canteen/me", undefined, somchai);
    expect(me.body.wallet.available).toBe(0);
    const no = await req("POST", "/canteen/pay", { merchantId, amount: 100, pin: "135790", idempotencyKey: key() }, somchai);
    expect(no.body.error.code).toBe("INSUFFICIENT_FUNDS");
    const list = await req("GET", "/org/employees?q=E001", undefined, hr);
    await req("POST", `/org/employees/${list.body[0].id}/topup`, { amount: 10000, idempotencyKey: key() }, hr);
    const yes = await req("POST", "/canteen/pay", { merchantId, amount: 6000, pin: "135790", idempotencyKey: key(), channel: "liff" }, somchai);
    expect(yes.body.status).toBe("completed");
  });

  it("LINE: link then one-tap login", async () => {
    const before = await req("POST", "/auth/line/login", { idToken: "sandbox:U1234abcd", deviceId: "liff-device-1" });
    expect(before.body.linked).toBe(false);
    await req("POST", "/auth/line/link", { idToken: "sandbox:U1234abcd" }, somchai);
    const after = await req("POST", "/auth/line/login", { idToken: "sandbox:U1234abcd", deviceId: "liff-device-1" });
    expect(after.body.linked).toBe(true);
    expect((await req("GET", "/canteen/me", undefined, after.body.accessToken)).body.lineLinked).toBe(true);
  });

  it("refund: shop refunds a purchase once; employee gets LINE receipts", async () => {
    const before = (await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance;
    const c = await req("POST", "/shop/charges", { amount: 3000 }, shop);
    const paid = await req("POST", "/canteen/pay", { merchantId, chargeId: c.body.chargeId, amount: 3000, pin: "135790", idempotencyKey: key() }, somchai);
    expect(paid.body.status).toBe("completed");
    await new Promise((r) => setTimeout(r, 100));
    expect(line.outbox.at(-1)).toMatchObject({ to: "U1234abcd" });
    expect(line.outbox.at(-1)!.text).toContain("จ่าย ฿30.00 ให้ ร้านป้าแดง");

    const salesBefore = (await req("GET", "/shop", undefined, shop)).body.today;
    const r = await req("POST", `/shop/transactions/${paid.body.id}/refund`, { reason: "กดยอดผิด" }, shop);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance).toBe(before);
    expect((await req("POST", `/shop/transactions/${paid.body.id}/refund`, {}, shop)).body.error.code).toBe("ALREADY_REFUNDED");
    const salesAfter = (await req("GET", "/shop", undefined, shop)).body.today;
    expect(salesAfter).toMatchObject({ count: salesBefore.count - 1, total: salesBefore.total - 3000 });
    const list = await req("GET", "/shop/transactions", undefined, shop);
    expect(list.body.find((t: { id: string }) => t.id === paid.body.id).refunded).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(line.outbox.at(-1)!.text).toContain("คืนเงิน ฿30.00");

    // Only the shop that was paid can refund, and only inside the window.
    const other = await req("POST", "/org/merchants", { name: "ร้านกาแฟ", ownerName: "ลุงชัย", ownerPhone: "0866666666" }, hr);
    const coffee = await activate("0866666666");
    const p2 = await req("POST", "/canteen/pay", { merchantId, amount: 1000, pin: "135790", idempotencyKey: key() }, somchai);
    expect((await req("POST", `/shop/transactions/${p2.body.id}/refund`, {}, coffee)).body.error.code).toBe("TX_NOT_FOUND");
    expect(other.status).toBe(200);
    await db.query("UPDATE transactions SET created_at = now() - interval '25 hours' WHERE id = $1", [p2.body.id]);
    expect((await req("POST", `/shop/transactions/${p2.body.id}/refund`, {}, shop)).body.error.code).toBe("REFUND_WINDOW");
  });

  it("shop quick-price buttons", async () => {
    const items = [{ label: "ข้าว 1 อย่าง", amount: 3500 }, { label: "ข้าว 2 อย่าง", amount: 4500 }];
    expect((await req("PUT", "/shop/quick-amounts", { items }, shop)).status).toBe(200);
    expect((await req("GET", "/shop", undefined, shop)).body.quickAmounts).toEqual(items);
    const tooMany = Array.from({ length: 13 }, (_, i) => ({ label: `x${i}`, amount: 100 }));
    expect((await req("PUT", "/shop/quick-amounts", { items: tooMany }, shop)).status).toBe(400);
  });

  it("HR back-enters a paper slip after an outage (idempotent, no PIN)", async () => {
    const e1 = (await req("GET", "/org/employees?q=E001", undefined, hr)).body[0];
    const before = (await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance;
    const k = key();
    const body = { memberId: e1.id, merchantId, amount: 1500, note: "ใบที่ 12", idempotencyKey: k };
    const r = await req("POST", "/org/manual-purchases", body, hr);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.channel).toBe("manual");
    await req("POST", "/org/manual-purchases", body, hr);
    expect((await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance).toBe(before - 1500);
    expect((await req("POST", "/org/manual-purchases", body, somchai)).status).toBe(403);
  });

  it("offboarding: positive balance cashed out, negative goes to the final payroll", async () => {
    const e1 = (await req("GET", "/org/employees?q=E001", undefined, hr)).body[0];
    const bal = (await req("GET", "/canteen/me", undefined, somchai)).body.wallet.balance;
    expect(bal).toBeGreaterThan(0);
    const off = await req("POST", `/org/employees/${e1.id}/offboard`, { leftover: "cash_out" }, hr);
    expect(off.body).toMatchObject({ moved: bal, finalDeduct: 0 });
    expect((await req("POST", "/canteen/pay", { merchantId, amount: 100, pin: "135790", idempotencyKey: key() }, somchai)).status).toBe(403);
    expect((await req("POST", `/org/employees/${e1.id}/offboard`, { leftover: "cash_out" }, hr)).body.error.code).toBe("ALREADY_OFFBOARDED");

    // Credit mode: สมหญิง (badge-only) overspends, then leaves.
    await req("PATCH", "/org", { moneyMode: "credit" }, hr);
    const e2 = (await req("GET", "/org/employees?q=E002", undefined, hr)).body[0];
    const badge = (await req("POST", `/org/employees/${e2.id}/badge`, {}, hr)).body.qr;
    const spend = e2.balance + 12000;
    const p = await req("POST", "/shop/badge-pay", { badge, amount: spend, pin: "246810", idempotencyKey: key() }, shop);
    expect(p.body.status, JSON.stringify(p.body)).toBe("completed");
    const off2 = await req("POST", `/org/employees/${e2.id}/offboard`, { leftover: "forfeit" }, hr);
    expect(off2.body).toMatchObject({ moved: 0, finalDeduct: 12000 });
    const pr = await req("GET", "/org/payroll", undefined, hr);
    expect(pr.body.items.find((x: { memberId: string }) => x.memberId === e2.id)).toMatchObject({ deduct: 12000, offboarded: true });
    expect((await req("POST", "/shop/badge-pay", { badge, amount: 100, pin: "246810", idempotencyKey: key() }, shop)).body.error.code).toBe("BADGE_NOT_FOUND");
  });

  it("rate limits are per device, not per IP (factory NAT)", async () => {
    // All injected requests come from 127.0.0.1, like employees behind one factory router.
    for (let i = 0; i < 15; i++) {
      const r = await req("POST", "/auth/login", { phone: "0899999999", pin: "000000", deviceId: `nat-device-${i}` });
      expect(r.status).not.toBe(429);
    }
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await req("POST", "/auth/login", { phone: "0899999999", pin: "000000", deviceId: "same-device-1" })).status);
    expect(codes).toContain(429);
  });

  it("ledger stays balanced", async () => {
    const bad = await db.query("SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount) <> 0");
    expect(bad.rowCount).toBe(0);
    const drift = await db.query(
      "SELECT a.id FROM accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id GROUP BY a.id, a.balance HAVING a.balance <> COALESCE(SUM(e.amount), 0)",
    );
    expect(drift.rowCount).toBe(0);
  });
});
