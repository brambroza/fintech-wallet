import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { amount, parse, pin } from "../lib/validate.js";
import { checkPin } from "../services/auth.js";
import { baht, bangkokTime, chargeQr, merchantQr, notifyEmployee, pay, purchaseReceipt, refund, requireRole } from "../services/canteen.js";
import { canteenTxView } from "./canteen-employee.js";

async function myShop(ctx: AppCtx, req: FastifyRequest) {
  const m = await requireRole(ctx, req, "merchant");
  const r = await ctx.db.query(
    `SELECT me.id, me.name, me.quick_amounts, a.id AS account_id, a.balance FROM merchants me JOIN accounts a ON a.merchant_id = me.id
     WHERE me.owner_id = $1 AND me.org_id = $2 AND me.status = 'active'`,
    [req.user!.id, m.orgId],
  );
  if (!r.rowCount) throw err.forbidden("ROLE_REQUIRED", "No active shop for this account");
  return { ...m, shop: r.rows[0] as { id: string; name: string; quick_amounts: QuickAmount[]; account_id: string; balance: number } };
}

type QuickAmount = { label: string; amount: number };

/** Today's sales, net of refunds. */
const today = `created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`;

export default async function canteenShopRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.get("/shop", async (req) => {
    const m = await myShop(ctx, req);
    const s = await ctx.db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::bigint AS total FROM transactions t
       WHERE merchant_id = $1 AND type = 'purchase' AND status = 'completed' AND ${today}
         AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.refund_of = t.id)`,
      [m.shop.id],
    );
    return {
      id: m.shop.id,
      name: m.shop.name,
      orgName: m.orgName,
      staticQr: merchantQr(m.shop.id),
      /** Owed to the shop by the company (paid out by HR at each cycle). */
      payable: m.shop.balance,
      today: s.rows[0],
      quickAmounts: m.shop.quick_amounts,
    };
  });

  /** Preset price buttons (one tap → charge QR). */
  app.put("/shop/quick-amounts", async (req) => {
    const m = await myShop(ctx, req);
    const b = parse(z.object({ items: z.array(z.object({ label: z.string().trim().min(1).max(30), amount })).max(12) }), req.body);
    await ctx.db.query("UPDATE merchants SET quick_amounts = $2 WHERE id = $1", [m.shop.id, JSON.stringify(b.items)]);
    return { quickAmounts: b.items };
  });

  /** Fixed-amount QR for one sale. */
  app.post("/shop/charges", async (req) => {
    const m = await myShop(ctx, req);
    const b = parse(z.object({ amount }), req.body);
    const r = await ctx.db.query(
      "INSERT INTO charges (merchant_id, amount, expires_at) VALUES ($1,$2, now() + make_interval(secs => $3)) RETURNING id, amount, expires_at",
      [m.shop.id, b.amount, ctx.cfg.CHARGE_TTL_SEC],
    );
    return { chargeId: r.rows[0].id, amount: r.rows[0].amount, expiresAt: r.rows[0].expires_at, qr: chargeQr(r.rows[0].id) };
  });

  app.get("/shop/charges/:id", async (req) => {
    const m = await myShop(ctx, req);
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const r = await ctx.db.query(
      `SELECT c.id, c.amount, c.status, c.expires_at, t.counterparty->'from'->>'name' AS payer
       FROM charges c LEFT JOIN transactions t ON t.id = c.paid_tx WHERE c.id = $1 AND c.merchant_id = $2`,
      [p.id, m.shop.id],
    );
    if (!r.rowCount) throw err.notFound("CHARGE_NOT_FOUND", "Not found");
    const c = r.rows[0];
    const expired = c.status === "open" && new Date(c.expires_at) < new Date();
    return { id: c.id, amount: c.amount, status: expired ? "expired" : c.status, payer: c.payer };
  });

  app.post("/shop/charges/:id/cancel", async (req) => {
    const m = await myShop(ctx, req);
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    await ctx.db.query("UPDATE charges SET status = 'cancelled' WHERE id = $1 AND merchant_id = $2 AND status = 'open'", [p.id, m.shop.id]);
    return { ok: true };
  });

  /**
   * Employee without a phone: the shop scans their badge QR and the employee types their PIN
   * on the shop's device. PIN lockout applies to the employee as usual.
   */
  app.post("/shop/badge-pay", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const m = await myShop(ctx, req);
    const b = parse(z.object({ badge: z.string().min(10).max(80), amount, pin, idempotencyKey: z.string().min(8).max(80) }), req.body);
    const token = b.badge.replace(/^CWB1:/, "");
    const e = await ctx.db.query(
      "SELECT user_id FROM org_members WHERE badge_token = $1 AND org_id = $2 AND role = 'employee' AND status = 'active'",
      [token, m.orgId],
    );
    if (!e.rowCount) throw err.notFound("BADGE_NOT_FOUND", "Unknown or inactive badge");
    const userId = e.rows[0].user_id;
    await checkPin(ctx, userId, b.pin);
    const t = await withTx(ctx.db, (tx) =>
      pay(ctx, tx, { userId, orgId: m.orgId, merchantId: m.shop.id, amount: b.amount, idempotencyKey: `badge:${b.idempotencyKey}`, channel: "badge", ip: req.ip }),
    );
    if (!t.replay) notifyEmployee(ctx, m.orgId, userId, purchaseReceipt(t));
    return canteenTxView(t, t.amount);
  });

  /** Full refund of one purchase made at this shop (wrong amount, double payment, cancelled order). */
  app.post("/shop/transactions/:id/refund", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const m = await myShop(ctx, req);
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ reason: z.string().trim().max(100).optional() }), req.body ?? {});
    const { refund: t, employeeId } = await withTx(ctx.db, (tx) =>
      refund(ctx, tx, { orgId: m.orgId, merchantId: m.shop.id, purchaseId: p.id, by: req.user!.id, reason: b.reason, ip: req.ip }),
    );
    notifyEmployee(
      ctx,
      m.orgId,
      employeeId,
      (available) => `${m.shop.name} คืนเงิน ${baht(t.amount)} ให้คุณแล้ว\nเวลา ${bangkokTime(t.created_at)}\nยอดที่ใช้ได้ ${baht(available)}`,
    );
    return canteenTxView(t, -t.amount);
  });

  app.get("/shop/transactions", async (req) => {
    const m = await myShop(ctx, req);
    const q = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
    const r = await ctx.db.query(
      `SELECT t.*, EXISTS (SELECT 1 FROM transactions r WHERE r.refund_of = t.id) AS refunded
       FROM transactions t WHERE merchant_id = $1 AND type IN ('purchase','merchant_payout','refund')
       AND created_at >= (COALESCE($2::date, (now() AT TIME ZONE 'Asia/Bangkok')::date))::timestamp AT TIME ZONE 'Asia/Bangkok'
       AND created_at <  (COALESCE($2::date, (now() AT TIME ZONE 'Asia/Bangkok')::date) + 1)::timestamp AT TIME ZONE 'Asia/Bangkok'
       ORDER BY created_at DESC LIMIT 500`,
      [m.shop.id, q.date ?? null],
    );
    return r.rows.map((row) => ({ ...canteenTxView(row, row.type === "purchase" ? row.amount : -row.amount), refunded: row.refunded }));
  });
}
