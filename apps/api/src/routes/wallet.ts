import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx, type Tx } from "../db.js";
import { err } from "../lib/errors.js";
import { amount, maskAccount, maskPhone, parse, phone, pin } from "../lib/validate.js";
import { audit, authenticate, checkPin } from "../services/auth.js";
import { mainAccount, postEntries, systemAccount } from "../services/ledger.js";
import type { PayoutTarget } from "../providers/index.js";

const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wallet"), phone }),
  z.object({ kind: z.literal("promptpay"), id: z.string().regex(/^(0\d{9}|\d{13})$/, "PromptPay ID must be a phone or 13-digit citizen ID") }),
  z.object({ kind: z.literal("bank"), bankCode: z.string().regex(/^[A-Z]{2,6}$/), accountNo: z.string().regex(/^\d{10,12}$/) }),
]);
type Target = z.infer<typeof target>;

async function requireKyc(ctx: AppCtx, userId: string) {
  const r = await ctx.db.query("SELECT kyc_status FROM users WHERE id = $1", [userId]);
  if (r.rows[0]?.kyc_status !== "approved") {
    throw err.forbidden("KYC_REQUIRED", "Verify your identity before sending or topping up money");
  }
}

function txView(row: Record<string, any>, delta: number) {
  const cp = row.counterparty ?? {};
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    fee: row.fee,
    delta,
    direction: delta >= 0 ? "in" : "out",
    counterparty: delta >= 0 ? (cp.from ?? null) : (cp.to ?? null),
    note: row.note,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

async function resolveTarget(ctx: AppCtx, userId: string, t: Target) {
  if (t.kind === "wallet") {
    const r = await ctx.db.query(
      "SELECT u.id, u.display_name, a.id AS account_id FROM users u JOIN accounts a ON a.user_id = u.id AND a.kind = 'user' WHERE u.phone = $1",
      [t.phone],
    );
    if (!r.rowCount) throw err.notFound("RECIPIENT_NOT_FOUND", "Recipient not found");
    if (r.rows[0].id === userId) throw err.badRequest("SELF_TRANSFER", "Cannot transfer to yourself");
    return {
      fee: 0,
      to: { kind: "wallet", name: r.rows[0].display_name, ref: maskPhone(t.phone), target: t },
      accountId: r.rows[0].account_id as string,
    };
  }
  const pt: PayoutTarget = t.kind === "promptpay" ? { kind: "promptpay", id: t.id } : t;
  const found = await ctx.providers.payout.lookup(pt);
  if (!found) throw err.notFound("RECIPIENT_NOT_FOUND", "Recipient not found");
  const ref = t.kind === "promptpay" ? (t.id.length === 10 ? maskPhone(t.id) : maskAccount(t.id)) : `${t.bankCode} ${maskAccount(t.accountNo)}`;
  return { fee: ctx.cfg.PAYOUT_FEE, to: { kind: t.kind, name: found.name, ref, target: t }, accountId: null, payout: pt };
}

async function checkDailyLimit(ctx: AppCtx, tx: Tx, userId: string, add: number) {
  const r = await tx.query(
    `SELECT COALESCE(SUM(amount + fee), 0)::bigint AS used FROM transactions
     WHERE initiated_by = $1 AND type IN ('p2p','payout') AND status <> 'failed'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`,
    [userId],
  );
  if (r.rows[0].used + add > ctx.cfg.DAILY_LIMIT) {
    throw err.badRequest("DAILY_LIMIT", "Daily transfer limit exceeded", { limit: ctx.cfg.DAILY_LIMIT, used: r.rows[0].used });
  }
}

export default async function walletRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.addHook("preHandler", async (req) => {
    if (req.routeOptions.config && (req.routeOptions.config as { public?: boolean }).public) return;
    await authenticate(ctx, req);
  });

  app.get("/me", async (req) => {
    const r = await ctx.db.query(
      `SELECT u.id, u.phone, u.display_name, u.kyc_status, u.kyc_reason, a.balance
       FROM users u JOIN accounts a ON a.user_id = u.id AND a.kind = 'user' WHERE u.id = $1`,
      [req.user!.id],
    );
    const u = r.rows[0];
    return {
      id: u.id,
      phone: u.phone,
      displayName: u.display_name,
      kyc: { status: u.kyc_status, reason: u.kyc_reason },
      balance: u.balance,
      dailyLimit: ctx.cfg.DAILY_LIMIT,
    };
  });

  app.get("/wallet/transactions", async (req) => {
    const q = parse(
      z.object({
        cursor: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        filter: z.enum(["all", "in", "out"]).default("all"),
      }),
      req.query,
    );
    const acc = await mainAccount(ctx.db, req.user!.id);
    const r = await ctx.db.query(
      `SELECT e.id AS cursor, e.amount AS delta, t.* FROM ledger_entries e JOIN transactions t ON t.id = e.transaction_id
       WHERE e.account_id = $1 AND ($2::bigint IS NULL OR e.id < $2)
         AND ($3 = 'all' OR ($3 = 'in' AND e.amount > 0) OR ($3 = 'out' AND e.amount < 0))
       ORDER BY e.id DESC LIMIT $4`,
      [acc.id, q.cursor ?? null, q.filter, q.limit],
    );
    return {
      items: r.rows.map((row) => txView(row, row.delta)),
      nextCursor: r.rows.length === q.limit ? r.rows[r.rows.length - 1].cursor : null,
    };
  });

  /** Sandbox top-up from a linked funding source. Real flow: bank direct-debit / card acquirer callback. */
  app.post("/wallet/topup", async (req) => {
    const b = parse(z.object({ amount, idempotencyKey: z.string().min(8).max(80) }), req.body);
    const userId = req.user!.id;
    await requireKyc(ctx, userId);
    return withTx(ctx.db, async (tx) => {
      const dup = await tx.query("SELECT * FROM transactions WHERE initiated_by = $1 AND idempotency_key = $2", [userId, b.idempotencyKey]);
      if (dup.rowCount) return txView(dup.rows[0], dup.rows[0].amount);
      const acc = await mainAccount(tx, userId);
      const src = await systemAccount(tx, "system_funding");
      const t = await tx.query(
        `INSERT INTO transactions (type, status, amount, from_account, to_account, initiated_by, counterparty, idempotency_key, completed_at)
         VALUES ('topup','completed',$1,$2,$3,$4,$5,$6, now()) RETURNING *`,
        [b.amount, src, acc.id, userId, { from: { kind: "topup", name: "เติมเงิน", ref: "sandbox" } }, b.idempotencyKey],
      );
      await postEntries(tx, t.rows[0].id, [
        { accountId: src, amount: -b.amount },
        { accountId: acc.id, amount: b.amount },
      ]);
      await audit(tx, userId, "wallet.topup", req.ip, { amount: b.amount });
      return txView(t.rows[0], b.amount);
    });
  });

  /** Name inquiry + fee, shown on the Review screen before the user enters their PIN. */
  app.post("/transfers/quote", async (req) => {
    const b = parse(z.object({ to: target, amount }), req.body);
    const r = await resolveTarget(ctx, req.user!.id, b.to);
    return { to: { kind: r.to.kind, name: r.to.name, ref: r.to.ref }, amount: b.amount, fee: r.fee, total: b.amount + r.fee };
  });

  app.post("/transfers", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const b = parse(
      z.object({ to: target, amount, pin, note: z.string().trim().max(100).optional(), idempotencyKey: z.string().min(8).max(80) }),
      req.body,
    );
    const userId = req.user!.id;
    await requireKyc(ctx, userId);

    const existing = await ctx.db.query("SELECT * FROM transactions WHERE initiated_by = $1 AND idempotency_key = $2", [userId, b.idempotencyKey]);
    if (existing.rowCount) return txView(existing.rows[0], -(existing.rows[0].amount + existing.rows[0].fee));

    await checkPin(ctx, userId, b.pin);
    const dest = await resolveTarget(ctx, userId, b.to);
    const me = await ctx.db.query("SELECT display_name, phone FROM users WHERE id = $1", [userId]);
    const from = { kind: "wallet", name: me.rows[0].display_name, ref: maskPhone(me.rows[0].phone) };
    // `target` (raw recipient id) is only ever shown back to the sender, for "recent recipients".
    const counterparty = { to: dest.to, from };
    const total = b.amount + dest.fee;

    const created = await withTx(ctx.db, async (tx) => {
      // Serialise this user's outgoing transfers so the daily-limit check can't be raced.
      await tx.query("SELECT id FROM accounts WHERE user_id = $1 AND kind = 'user' FOR UPDATE", [userId]);
      await checkDailyLimit(ctx, tx, userId, total);
      const acc = await mainAccount(tx, userId);
      if (dest.accountId) {
        const t = await tx.query(
          `INSERT INTO transactions (type, status, amount, from_account, to_account, initiated_by, counterparty, note, idempotency_key, completed_at)
           VALUES ('p2p','completed',$1,$2,$3,$4,$5,$6,$7, now()) RETURNING *`,
          [b.amount, acc.id, dest.accountId, userId, counterparty, b.note ?? null, b.idempotencyKey],
        );
        await postEntries(tx, t.rows[0].id, [
          { accountId: acc.id, amount: -b.amount },
          { accountId: dest.accountId, amount: b.amount },
        ]);
        await audit(tx, userId, "transfer.p2p", req.ip, { txId: t.rows[0].id, amount: b.amount });
        return t.rows[0];
      }
      const payout = await systemAccount(tx, "system_payout");
      const feeAcc = await systemAccount(tx, "system_fee");
      const t = await tx.query(
        `INSERT INTO transactions (type, status, amount, fee, from_account, to_account, initiated_by, counterparty, note, idempotency_key)
         VALUES ('payout','pending',$1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [b.amount, dest.fee, acc.id, payout, userId, counterparty, b.note ?? null, b.idempotencyKey],
      );
      const entries = [
        { accountId: acc.id, amount: -total },
        { accountId: payout, amount: b.amount },
        ...(dest.fee ? [{ accountId: feeAcc, amount: dest.fee }] : []),
      ];
      await postEntries(tx, t.rows[0].id, entries);
      return t.rows[0];
    });

    if (!dest.payout) return txView(created, -b.amount);

    // Funds are reserved (debited) before calling the rail; on failure we post a reversal.
    const res = await ctx.providers.payout.send({ target: dest.payout, amount: b.amount, reference: created.id });
    const final = await withTx(ctx.db, async (tx) => {
      if (res.ok) {
        const r = await tx.query(
          "UPDATE transactions SET status = 'completed', provider_ref = $2, completed_at = now() WHERE id = $1 RETURNING *",
          [created.id, res.providerRef],
        );
        await audit(tx, userId, "transfer.payout", req.ip, { txId: created.id, amount: b.amount });
        return r.rows[0];
      }
      const acc = await mainAccount(tx, userId);
      const payout = await systemAccount(tx, "system_payout");
      const feeAcc = await systemAccount(tx, "system_fee");
      const rev = await tx.query(
        `INSERT INTO transactions (type, status, amount, from_account, to_account, initiated_by, counterparty, note, completed_at)
         VALUES ('reversal','completed',$1,$2,$3,$4,$5,$6, now()) RETURNING id`,
        [total, payout, acc.id, userId, { from: { kind: "refund", name: "คืนเงิน โอนไม่สำเร็จ", ref: created.id } }, `reversal of ${created.id}`],
      );
      await postEntries(tx, rev.rows[0].id, [
        { accountId: payout, amount: -b.amount },
        ...(created.fee ? [{ accountId: feeAcc, amount: -created.fee }] : []),
        { accountId: acc.id, amount: total },
      ]);
      const r = await tx.query("UPDATE transactions SET status = 'failed', failure_reason = $2 WHERE id = $1 RETURNING *", [
        created.id,
        res.reason,
      ]);
      await audit(tx, userId, "transfer.payout_failed", req.ip, { txId: created.id, reason: res.reason });
      return r.rows[0];
    });
    return txView(final, -total);
  });

  app.get("/transfers/recents", async (req) => {
    const r = await ctx.db.query(
      `SELECT DISTINCT ON (counterparty->'to'->>'ref') counterparty->'to' AS to, created_at
       FROM transactions WHERE initiated_by = $1 AND type IN ('p2p','payout') AND counterparty ? 'to'
       ORDER BY counterparty->'to'->>'ref', created_at DESC`,
      [req.user!.id],
    );
    return r.rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 10).map((x) => x.to);
  });

  // ---------- Savings goals (pockets backed by their own ledger account) ----------
  app.get("/goals", async (req) => {
    const r = await ctx.db.query(
      `SELECT g.id, g.name, g.target, a.balance AS saved, g.created_at FROM goals g
       JOIN accounts a ON a.goal_id = g.id WHERE g.user_id = $1 ORDER BY g.created_at`,
      [req.user!.id],
    );
    return r.rows;
  });

  app.post("/goals", async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(40), target: amount }), req.body);
    return withTx(ctx.db, async (tx) => {
      const g = await tx.query("INSERT INTO goals (user_id, name, target) VALUES ($1,$2,$3) RETURNING id, name, target, created_at", [
        req.user!.id,
        b.name,
        b.target,
      ]);
      await tx.query("INSERT INTO accounts (kind, user_id, goal_id) VALUES ('goal', $1, $2)", [req.user!.id, g.rows[0].id]);
      return { ...g.rows[0], saved: 0 };
    });
  });

  app.post("/goals/:id/move", async (req) => {
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ amount, direction: z.enum(["deposit", "withdraw"]) }), req.body);
    const userId = req.user!.id;
    return withTx(ctx.db, async (tx) => {
      const g = await tx.query(
        "SELECT a.id FROM goals g JOIN accounts a ON a.goal_id = g.id WHERE g.id = $1 AND g.user_id = $2",
        [p.id, userId],
      );
      if (!g.rowCount) throw err.notFound("GOAL_NOT_FOUND", "Goal not found");
      const goalAcc = g.rows[0].id;
      const acc = await mainAccount(tx, userId);
      const [from, to] = b.direction === "deposit" ? [acc.id, goalAcc] : [goalAcc, acc.id];
      const t = await tx.query(
        `INSERT INTO transactions (type, status, amount, from_account, to_account, initiated_by, counterparty, completed_at)
         VALUES ('goal_deposit','completed',$1,$2,$3,$4,$5, now()) RETURNING id`,
        [b.amount, from, to, userId, { to: { kind: "goal", name: "เป้าออม", ref: p.id }, from: { kind: "goal", name: "เป้าออม", ref: p.id } }],
      );
      await postEntries(tx, t.rows[0].id, [
        { accountId: from, amount: -b.amount },
        { accountId: to, amount: b.amount },
      ]);
      const saved = await tx.query("SELECT balance FROM accounts WHERE id = $1", [goalAcc]);
      return { id: p.id, saved: saved.rows[0].balance };
    });
  });

  /** Spending this month (Bangkok time), for the Save tab budget/insights. */
  app.get("/insights/month", async (req) => {
    const acc = await mainAccount(ctx.db, req.user!.id);
    const r = await ctx.db.query(
      `SELECT t.type, SUM(-e.amount)::bigint AS spent FROM ledger_entries e JOIN transactions t ON t.id = e.transaction_id
       WHERE e.account_id = $1 AND e.amount < 0 AND t.type IN ('p2p','payout')
         AND e.created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'
       GROUP BY t.type`,
      [acc.id],
    );
    const byType = Object.fromEntries(r.rows.map((x) => [x.type, x.spent]));
    return { spent: r.rows.reduce((s, x) => s + x.spent, 0), byType };
  });
}
