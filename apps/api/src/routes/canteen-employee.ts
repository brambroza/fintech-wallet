import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { amount, parse, pin } from "../lib/validate.js";
import { authenticate, checkPin } from "../services/auth.js";
import { employeeAccount, notifyEmployee, parseQr, pay, purchaseReceipt, requireRole } from "../services/canteen.js";

export function canteenTxView(row: Record<string, any>, delta: number) {
  const cp = row.counterparty ?? {};
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    delta,
    direction: delta >= 0 ? "in" : "out",
    counterparty: delta >= 0 ? (cp.from ?? null) : (cp.to ?? null),
    channel: row.channel,
    note: row.note,
    createdAt: row.created_at,
  };
}

export default async function canteenEmployeeRoutes(app: FastifyInstance, ctx: AppCtx) {
  /** Who am I in the canteen system: roles across orgs + my employee wallet. */
  app.get("/canteen/me", async (req) => {
    await authenticate(ctx, req);
    const userId = req.user!.id;
    const u = await ctx.db.query("SELECT id, phone, display_name, line_user_id FROM users WHERE id = $1", [userId]);
    const roles = await ctx.db.query(
      `SELECT m.role, m.org_id, o.name AS org_name, o.money_mode, me.id AS merchant_id, me.name AS merchant_name
       FROM org_members m JOIN orgs o ON o.id = m.org_id
       LEFT JOIN merchants me ON m.role = 'merchant' AND me.owner_id = m.user_id AND me.org_id = m.org_id
       WHERE m.user_id = $1 AND m.status = 'active' ORDER BY m.created_at`,
      [userId],
    );
    const emp = roles.rows.find((r) => r.role === "employee");
    let wallet = null;
    if (emp) {
      const acc = await employeeAccount(ctx.db, emp.org_id, userId);
      const o = await ctx.db.query("SELECT daily_limit, welfare_amount FROM orgs WHERE id = $1", [emp.org_id]);
      const spent = await ctx.db.query(
        `SELECT COALESCE(SUM(amount), 0)::bigint AS v FROM transactions t WHERE initiated_by = $1 AND org_id = $2 AND type = 'purchase'
         AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.refund_of = t.id)
         AND status = 'completed' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`,
        [userId, emp.org_id],
      );
      wallet = {
        orgId: emp.org_id,
        orgName: emp.org_name,
        mode: emp.money_mode,
        balance: acc.balance,
        /** Spendable now = balance down to the floor (0, or -credit limit). */
        available: acc.balance - acc.min_balance,
        creditLimit: -acc.min_balance,
        dailyLimit: o.rows[0].daily_limit,
        spentToday: spent.rows[0].v,
        welfareAmount: o.rows[0].welfare_amount,
      };
    }
    return {
      id: userId,
      phone: u.rows[0].phone,
      displayName: u.rows[0].display_name,
      lineLinked: !!u.rows[0].line_user_id,
      roles: roles.rows.map((r) => ({ role: r.role, orgId: r.org_id, orgName: r.org_name, merchantId: r.merchant_id, merchantName: r.merchant_name })),
      wallet,
    };
  });

  /** What does this QR pay? Shown before the PIN. */
  app.post("/canteen/pay/resolve", async (req) => {
    const m = await requireRole(ctx, req, "employee");
    const b = parse(z.object({ qr: z.string().min(10).max(200) }), req.body);
    const q = parseQr(b.qr);
    if (q.kind === "charge") {
      const r = await ctx.db.query(
        `SELECT c.id, c.amount, c.status, c.expires_at, me.id AS merchant_id, me.name FROM charges c JOIN merchants me ON me.id = c.merchant_id
         WHERE c.id = $1 AND me.org_id = $2`,
        [q.id, m.orgId],
      );
      const c = r.rows[0];
      if (!c) throw err.notFound("CHARGE_NOT_FOUND", "Payment request not found");
      if (c.status !== "open") throw err.conflict("CHARGE_CLOSED", "This QR was already used");
      if (new Date(c.expires_at) < new Date()) throw err.conflict("CHARGE_EXPIRED", "This QR has expired");
      return { merchantId: c.merchant_id, merchantName: c.name, amount: c.amount, chargeId: c.id };
    }
    const r = await ctx.db.query("SELECT id, name FROM merchants WHERE id = $1 AND org_id = $2 AND status = 'active'", [q.id, m.orgId]);
    if (!r.rowCount) throw err.notFound("MERCHANT_NOT_FOUND", "Shop not found");
    return { merchantId: r.rows[0].id, merchantName: r.rows[0].name, amount: null, chargeId: null };
  });

  app.post("/canteen/pay", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const m = await requireRole(ctx, req, "employee");
    const b = parse(
      z.object({
        merchantId: z.string().uuid(),
        chargeId: z.string().uuid().optional(),
        amount,
        pin,
        idempotencyKey: z.string().min(8).max(80),
        channel: z.enum(["app", "liff"]).default("app"),
      }),
      req.body,
    );
    await checkPin(ctx, req.user!.id, b.pin);
    const t = await withTx(ctx.db, (tx) =>
      pay(ctx, tx, { userId: req.user!.id, orgId: m.orgId, merchantId: b.merchantId, chargeId: b.chargeId, amount: b.amount, idempotencyKey: b.idempotencyKey, channel: b.channel, ip: req.ip }),
    );
    if (!t.replay) notifyEmployee(ctx, m.orgId, req.user!.id, purchaseReceipt(t));
    return canteenTxView(t, -t.amount);
  });

  app.get("/canteen/transactions", async (req) => {
    const m = await requireRole(ctx, req, "employee");
    const q = parse(
      z.object({ cursor: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }),
      req.query,
    );
    const acc = await employeeAccount(ctx.db, m.orgId, req.user!.id);
    const r = await ctx.db.query(
      `SELECT e.id AS cursor, e.amount AS delta, t.* FROM ledger_entries e JOIN transactions t ON t.id = e.transaction_id
       WHERE e.account_id = $1 AND ($2::bigint IS NULL OR e.id < $2) ORDER BY e.id DESC LIMIT $3`,
      [acc.id, q.cursor ?? null, q.limit],
    );
    return {
      items: r.rows.map((row) => canteenTxView(row, row.delta)),
      nextCursor: r.rows.length === q.limit ? r.rows[r.rows.length - 1].cursor : null,
    };
  });
}
