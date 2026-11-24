import type { FastifyRequest } from "fastify";
import type { AppCtx } from "../context.js";
import type { Db, Tx } from "../db.js";
import { err } from "../lib/errors.js";
import { randomToken } from "../lib/crypto.js";
import { audit, authenticate } from "./auth.js";
import { postEntries } from "./ledger.js";

export type Role = "employee" | "hr" | "merchant";
export type Member = {
  memberId: string;
  orgId: string;
  orgName: string;
  role: Role;
  moneyMode: "credit" | "prepaid";
};

/** Authenticates and returns the caller's active membership with `role` (first org found). */
export async function requireRole(ctx: AppCtx, req: FastifyRequest, role: Role): Promise<Member> {
  await authenticate(ctx, req);
  const r = await ctx.db.query(
    `SELECT m.id, m.org_id, o.name, o.money_mode FROM org_members m JOIN orgs o ON o.id = m.org_id
     WHERE m.user_id = $1 AND m.role = $2 AND m.status = 'active' ORDER BY m.created_at LIMIT 1`,
    [req.user!.id, role],
  );
  if (!r.rowCount) throw err.forbidden("ROLE_REQUIRED", `Requires ${role} access`);
  const m = r.rows[0];
  return { memberId: m.id, orgId: m.org_id, orgName: m.name, role, moneyMode: m.money_mode };
}

export async function orgAccount(db: Db | Tx, orgId: string, kind: "org_welfare" | "org_settlement"): Promise<string> {
  const r = await db.query("SELECT id FROM accounts WHERE org_id = $1 AND kind = $2", [orgId, kind]);
  if (!r.rowCount) throw new Error(`Missing ${kind} account for org ${orgId}`);
  return r.rows[0].id;
}

export async function employeeAccount(db: Db | Tx, orgId: string, userId: string, lock = false) {
  const r = await db.query(
    `SELECT id, balance, min_balance FROM accounts WHERE org_id = $1 AND user_id = $2 AND kind = 'employee'${lock ? " FOR UPDATE" : ""}`,
    [orgId, userId],
  );
  if (!r.rowCount) throw err.notFound("ACCOUNT_NOT_FOUND", "Employee account not found");
  return r.rows[0] as { id: string; balance: number; min_balance: number };
}

export function minBalanceFor(mode: "credit" | "prepaid", creditLimit: number) {
  return mode === "credit" ? -creditLimit : 0;
}

/** Creates an org with its house accounts. */
export async function createOrg(tx: Tx, o: { name: string; code: string; moneyMode: "credit" | "prepaid" }) {
  const r = await tx.query("INSERT INTO orgs (name, code, money_mode) VALUES ($1,$2,$3) RETURNING *", [o.name, o.code, o.moneyMode]);
  const org = r.rows[0];
  await tx.query("INSERT INTO accounts (kind, org_id) VALUES ('org_welfare', $1), ('org_settlement', $1)", [org.id]);
  return org;
}

/** Finds or creates a user by phone (or a phone-less badge user) and adds an org membership. */
export async function upsertMember(
  tx: Tx,
  org: { id: string; money_mode: "credit" | "prepaid"; credit_limit: number },
  m: { role: Role; name: string; phone?: string | null; employeeCode?: string | null; department?: string | null },
): Promise<{ userId: string; memberId: string; created: boolean }> {
  let userId: string | null = null;
  if (m.role === "employee" && m.employeeCode) {
    const ex = await tx.query("SELECT user_id FROM org_members WHERE org_id = $1 AND role = 'employee' AND employee_code = $2", [org.id, m.employeeCode]);
    userId = ex.rows[0]?.user_id ?? null;
  }
  if (!userId && m.phone) {
    const u = await tx.query("SELECT id FROM users WHERE phone = $1", [m.phone]);
    userId = u.rows[0]?.id ?? null;
  }
  let created = false;
  if (!userId) {
    const u = await tx.query("INSERT INTO users (phone, display_name) VALUES ($1, $2) RETURNING id", [m.phone ?? null, m.name]);
    userId = u.rows[0].id as string;
    created = true;
  } else {
    await tx.query("UPDATE users SET display_name = $2, phone = COALESCE($3, phone) WHERE id = $1", [userId, m.name, m.phone ?? null]);
  }
  const mem = await tx.query(
    `INSERT INTO org_members (org_id, user_id, role, employee_code, department, badge_token)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id, user_id, role) DO UPDATE SET employee_code = EXCLUDED.employee_code, department = EXCLUDED.department
     RETURNING id`,
    [org.id, userId, m.role, m.employeeCode ?? null, m.department ?? null, m.role === "employee" ? randomToken(18) : null],
  );
  if (m.role === "employee") {
    await tx.query(
      `INSERT INTO accounts (kind, org_id, user_id, min_balance) VALUES ('employee', $1, $2, $3)
       ON CONFLICT (org_id, user_id) WHERE kind = 'employee' DO NOTHING`,
      [org.id, userId, minBalanceFor(org.money_mode, org.credit_limit)],
    );
  }
  return { userId: userId!, memberId: mem.rows[0].id, created };
}

/** Parses a payment QR: `CWP1:C:<chargeId>` (amount fixed) or `CWP1:M:<merchantId>` (employee types the amount). */
export function parseQr(qr: string): { kind: "charge" | "merchant"; id: string } {
  const m = /^CWP1:([CM]):([0-9a-f-]{36})$/i.exec(qr.trim());
  if (!m) throw err.badRequest("QR_INVALID", "This QR is not a canteen payment QR");
  return { kind: m[1].toUpperCase() === "C" ? "charge" : "merchant", id: m[2].toLowerCase() };
}
export const chargeQr = (id: string) => `CWP1:C:${id}`;
export const merchantQr = (id: string) => `CWP1:M:${id}`;

export type PayInput = {
  userId: string;
  orgId: string;
  merchantId: string;
  amount: number;
  chargeId?: string;
  idempotencyKey: string;
  channel: "app" | "liff" | "badge";
  ip?: string;
};

/**
 * Employee pays a merchant in the same org. Caller must have checked the PIN.
 * Locks the employee account first, so the daily limit and balance checks can't be raced.
 */
export async function pay(ctx: AppCtx, tx: Tx, p: PayInput) {
  const dup = await tx.query("SELECT * FROM transactions WHERE initiated_by = $1 AND idempotency_key = $2", [p.userId, p.idempotencyKey]);
  if (dup.rowCount) return dup.rows[0];

  const acc = await employeeAccount(tx, p.orgId, p.userId, true);
  const mem = await tx.query(
    `SELECT m.status, u.display_name, m.employee_code, o.daily_limit FROM org_members m
     JOIN users u ON u.id = m.user_id JOIN orgs o ON o.id = m.org_id
     WHERE m.org_id = $1 AND m.user_id = $2 AND m.role = 'employee'`,
    [p.orgId, p.userId],
  );
  if (!mem.rowCount || mem.rows[0].status !== "active") throw err.forbidden("EMPLOYEE_INACTIVE", "Employee is not active");
  const mer = await tx.query(
    "SELECT m.id, m.name, m.status, a.id AS account_id FROM merchants m JOIN accounts a ON a.merchant_id = m.id WHERE m.id = $1 AND m.org_id = $2",
    [p.merchantId, p.orgId],
  );
  if (!mer.rowCount || mer.rows[0].status !== "active") throw err.notFound("MERCHANT_NOT_FOUND", "Shop not found");

  if (p.chargeId) {
    const c = await tx.query("SELECT * FROM charges WHERE id = $1 FOR UPDATE", [p.chargeId]);
    const ch = c.rows[0];
    if (!ch || ch.merchant_id !== p.merchantId) throw err.notFound("CHARGE_NOT_FOUND", "Payment request not found");
    if (ch.status !== "open") throw err.conflict("CHARGE_CLOSED", "This QR was already used");
    if (new Date(ch.expires_at) < new Date()) throw err.conflict("CHARGE_EXPIRED", "This QR has expired");
    if (ch.amount !== p.amount) throw err.badRequest("AMOUNT_MISMATCH", "Amount does not match the shop's request");
  }

  const used = await tx.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS used FROM transactions
     WHERE initiated_by = $1 AND org_id = $2 AND type = 'purchase' AND status = 'completed'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`,
    [p.userId, p.orgId],
  );
  if (used.rows[0].used + p.amount > mem.rows[0].daily_limit) {
    throw err.badRequest("DAILY_LIMIT", "Daily spending limit exceeded", { limit: mem.rows[0].daily_limit, used: used.rows[0].used });
  }
  if (acc.balance - p.amount < acc.min_balance) {
    throw err.badRequest("INSUFFICIENT_FUNDS", "Not enough balance or credit", { available: acc.balance - acc.min_balance });
  }

  const t = await tx.query(
    `INSERT INTO transactions (type, status, amount, from_account, to_account, initiated_by, counterparty, idempotency_key, completed_at, org_id, merchant_id, channel)
     VALUES ('purchase','completed',$1,$2,$3,$4,$5,$6, now(), $7, $8, $9) RETURNING *`,
    [
      p.amount,
      acc.id,
      mer.rows[0].account_id,
      p.userId,
      {
        to: { kind: "merchant", name: mer.rows[0].name, ref: p.merchantId },
        from: { kind: "employee", name: mem.rows[0].display_name, ref: mem.rows[0].employee_code ?? "" },
      },
      p.idempotencyKey,
      p.orgId,
      p.merchantId,
      p.channel,
    ],
  );
  await postEntries(tx, t.rows[0].id, [
    { accountId: acc.id, amount: -p.amount },
    { accountId: mer.rows[0].account_id, amount: p.amount },
  ]);
  if (p.chargeId) await tx.query("UPDATE charges SET status = 'paid', paid_tx = $2 WHERE id = $1", [p.chargeId, t.rows[0].id]);
  await audit(tx, p.userId, "canteen.purchase", p.ip, { txId: t.rows[0].id, amount: p.amount, channel: p.channel });
  return t.rows[0];
}

/** A two-legged house transfer (welfare credit, payroll settlement, merchant payout, manual top-up). */
export async function houseTransfer(
  tx: Tx,
  t: {
    type: "welfare" | "payroll_settle" | "merchant_payout" | "topup" | "refund";
    orgId: string;
    from: string;
    to: string;
    amount: number;
    by: string;
    counterparty: object;
    note?: string;
    key?: string;
    merchantId?: string;
  },
) {
  const r = await tx.query(
    `INSERT INTO transactions (type, status, amount, from_account, to_account, initiated_by, counterparty, note, idempotency_key, completed_at, org_id, merchant_id)
     VALUES ($1,'completed',$2,$3,$4,$5,$6,$7,$8, now(), $9, $10) RETURNING *`,
    [t.type, t.amount, t.from, t.to, t.by, t.counterparty, t.note ?? null, t.key ?? null, t.orgId, t.merchantId ?? null],
  );
  await postEntries(tx, r.rows[0].id, [
    { accountId: t.from, amount: -t.amount },
    { accountId: t.to, amount: t.amount },
  ]);
  return r.rows[0];
}
