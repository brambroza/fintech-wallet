import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { hashPin, isWeakPin, randomToken } from "../lib/crypto.js";
import { amount, parse, phone, pin } from "../lib/validate.js";
import { audit } from "../services/auth.js";
import { employeeAccount, houseTransfer, minBalanceFor, orgAccount, requireRole, upsertMember } from "../services/canteen.js";

const satang = z.number().int().min(0).max(100_000_000);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Bangkok-day range helper: [from 00:00, to+1 00:00). */
const range = `created_at >= ($2::date)::timestamp AT TIME ZONE 'Asia/Bangkok' AND created_at < ($3::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok'`;

export default async function canteenHrRoutes(app: FastifyInstance, ctx: AppCtx) {
  // ---------- Org settings ----------
  app.get("/org", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const r = await ctx.db.query("SELECT id, name, code, money_mode, credit_limit, daily_limit, welfare_amount FROM orgs WHERE id = $1", [m.orgId]);
    const o = r.rows[0];
    return { id: o.id, name: o.name, code: o.code, moneyMode: o.money_mode, creditLimit: o.credit_limit, dailyLimit: o.daily_limit, welfareAmount: o.welfare_amount };
  });

  app.patch("/org", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const b = parse(
      z.object({ moneyMode: z.enum(["credit", "prepaid"]).optional(), creditLimit: satang.optional(), dailyLimit: amount.optional(), welfareAmount: satang.optional() }),
      req.body,
    );
    return withTx(ctx.db, async (tx) => {
      const o = await tx.query(
        `UPDATE orgs SET money_mode = COALESCE($2, money_mode), credit_limit = COALESCE($3, credit_limit),
           daily_limit = COALESCE($4, daily_limit), welfare_amount = COALESCE($5, welfare_amount)
         WHERE id = $1 RETURNING money_mode, credit_limit`,
        [m.orgId, b.moneyMode ?? null, b.creditLimit ?? null, b.dailyLimit ?? null, b.welfareAmount ?? null],
      );
      const floor = minBalanceFor(o.rows[0].money_mode, o.rows[0].credit_limit);
      // Lowering the floor is always safe; raising it can't push existing negatives into violation,
      // so accounts already below the new floor keep their current balance as the floor until settled.
      await tx.query("UPDATE accounts SET min_balance = LEAST($2, balance) WHERE org_id = $1 AND kind = 'employee'", [m.orgId, floor]);
      await audit(tx, req.user!.id, "org.settings", req.ip, b);
      return { ok: true };
    });
  });

  // ---------- Employees ----------
  app.get("/org/employees", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const q = parse(z.object({ q: z.string().max(60).optional(), status: z.enum(["active", "inactive", "all"]).default("all") }), req.query);
    const r = await ctx.db.query(
      `SELECT m.id, m.user_id, m.employee_code, m.department, m.status, u.display_name, u.phone,
              (u.pin_hash IS NOT NULL) AS activated, (u.line_user_id IS NOT NULL) AS line_linked, a.balance, a.min_balance
       FROM org_members m JOIN users u ON u.id = m.user_id
       JOIN accounts a ON a.org_id = m.org_id AND a.user_id = m.user_id AND a.kind = 'employee'
       WHERE m.org_id = $1 AND m.role = 'employee' AND ($3 = 'all' OR m.status = $3)
         AND ($2::text IS NULL OR u.display_name ILIKE '%' || $2 || '%' OR m.employee_code ILIKE '%' || $2 || '%' OR u.phone LIKE '%' || $2 || '%')
       ORDER BY m.employee_code NULLS LAST, u.display_name LIMIT 5000`,
      [m.orgId, q.q || null, q.status],
    );
    return r.rows.map((e) => ({
      id: e.id,
      userId: e.user_id,
      code: e.employee_code,
      name: e.display_name,
      department: e.department,
      phone: e.phone,
      status: e.status,
      activated: e.activated,
      lineLinked: e.line_linked,
      balance: e.balance,
      available: e.balance - e.min_balance,
    }));
  });

  /** Upsert by employee code. Phone optional (badge-only employees). */
  app.post("/org/employees/import", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const b = parse(
      z.object({
        employees: z
          .array(
            z.object({
              code: z.string().trim().min(1).max(30),
              name: z.string().trim().min(1).max(80),
              department: z.string().trim().max(60).optional().nullable(),
              phone: phone.optional().nullable().or(z.literal("").transform(() => null)),
            }),
          )
          .min(1)
          .max(5000),
      }),
      req.body,
    );
    return withTx(ctx.db, async (tx) => {
      const org = (await tx.query("SELECT id, money_mode, credit_limit FROM orgs WHERE id = $1", [m.orgId])).rows[0];
      let created = 0;
      let updated = 0;
      const errors: { code: string; message: string }[] = [];
      for (const e of b.employees) {
        await tx.query("SAVEPOINT row");
        try {
          const r = await upsertMember(tx, org, { role: "employee", name: e.name, phone: e.phone ?? null, employeeCode: e.code, department: e.department ?? null });
          if (r.created) created++;
          else updated++;
          await tx.query("RELEASE SAVEPOINT row");
        } catch (x) {
          await tx.query("ROLLBACK TO SAVEPOINT row");
          const code = (x as { code?: string }).code;
          errors.push({ code: e.code, message: code === "23505" ? "เบอร์โทรซ้ำกับพนักงานคนอื่น" : "นำเข้าไม่สำเร็จ" });
        }
      }
      await audit(tx, req.user!.id, "org.employees_import", req.ip, { created, updated, errors: errors.length });
      return { created, updated, errors };
    });
  });

  app.patch("/org/employees/:id", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ status: z.enum(["active", "inactive"]).optional(), department: z.string().max(60).optional() }), req.body);
    const r = await ctx.db.query(
      "UPDATE org_members SET status = COALESCE($3, status), department = COALESCE($4, department) WHERE id = $1 AND org_id = $2 AND role = 'employee' RETURNING id",
      [p.id, m.orgId, b.status ?? null, b.department ?? null],
    );
    if (!r.rowCount) throw err.notFound("EMPLOYEE_NOT_FOUND", "Employee not found");
    await audit(ctx.db, req.user!.id, "org.employee_update", req.ip, { memberId: p.id, ...b });
    return { ok: true };
  });

  /** Badge QR payload for printing; `rotate` invalidates a lost badge. */
  app.post("/org/employees/:id/badge", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ rotate: z.boolean().default(false) }), req.body ?? {});
    const r = await ctx.db.query(
      `UPDATE org_members SET badge_token = CASE WHEN $3 THEN $4 ELSE badge_token END
       WHERE id = $1 AND org_id = $2 AND role = 'employee' RETURNING badge_token`,
      [p.id, m.orgId, b.rotate, randomToken(18)],
    );
    if (!r.rowCount) throw err.notFound("EMPLOYEE_NOT_FOUND", "Employee not found");
    if (b.rotate) await audit(ctx.db, req.user!.id, "org.badge_rotated", req.ip, { memberId: p.id });
    return { qr: `CWB1:${r.rows[0].badge_token}` };
  });

  /** All active employees' badge QR payloads, for printing a sheet. */
  app.get("/org/badges", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const r = await ctx.db.query(
      `SELECT m.id, m.employee_code, m.department, u.display_name, m.badge_token FROM org_members m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 AND m.role = 'employee' AND m.status = 'active' ORDER BY m.employee_code`,
      [m.orgId],
    );
    await audit(ctx.db, req.user!.id, "org.badges_exported", req.ip, { count: r.rowCount });
    return r.rows.map((x) => ({ id: x.id, code: x.employee_code, name: x.display_name, department: x.department, qr: `CWB1:${x.badge_token}` }));
  });

  /** For badge-only employees: the employee types their own PIN at the HR desk. */
  app.post("/org/employees/:id/pin", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ pin }), req.body);
    if (isWeakPin(b.pin)) throw err.badRequest("PIN_WEAK", "PIN is too easy to guess");
    const r = await ctx.db.query(
      `UPDATE users SET pin_hash = $3, pin_failed = 0, pin_locked_until = NULL
       WHERE id = (SELECT user_id FROM org_members WHERE id = $1 AND org_id = $2 AND role = 'employee') RETURNING id`,
      [p.id, m.orgId, await hashPin(b.pin)],
    );
    if (!r.rowCount) throw err.notFound("EMPLOYEE_NOT_FOUND", "Employee not found");
    await audit(ctx.db, req.user!.id, "org.employee_pin_set", req.ip, { memberId: p.id });
    return { ok: true };
  });

  /** Cash received at the HR desk (prepaid mode) → credit the employee. */
  app.post("/org/employees/:id/topup", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ amount, note: z.string().max(100).optional(), idempotencyKey: z.string().min(8).max(80) }), req.body);
    return withTx(ctx.db, async (tx) => {
      const e = await tx.query("SELECT user_id FROM org_members WHERE id = $1 AND org_id = $2 AND role = 'employee'", [p.id, m.orgId]);
      if (!e.rowCount) throw err.notFound("EMPLOYEE_NOT_FOUND", "Employee not found");
      const dup = await tx.query("SELECT id FROM transactions WHERE initiated_by = $1 AND idempotency_key = $2", [req.user!.id, b.idempotencyKey]);
      if (dup.rowCount) return { id: dup.rows[0].id };
      const acc = await employeeAccount(tx, m.orgId, e.rows[0].user_id);
      const t = await houseTransfer(tx, {
        type: "topup",
        orgId: m.orgId,
        from: await orgAccount(tx, m.orgId, "org_settlement"),
        to: acc.id,
        amount: b.amount,
        by: req.user!.id,
        counterparty: { from: { kind: "hr", name: "เติมเงินที่ฝ่ายบุคคล", ref: "" } },
        note: b.note,
        key: b.idempotencyKey,
      });
      await audit(tx, req.user!.id, "org.employee_topup", req.ip, { memberId: p.id, amount: b.amount });
      return { id: t.id };
    });
  });

  /** Credit every active employee with the org's welfare amount for a cycle — once per cycle. */
  app.post("/org/welfare/run", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const b = parse(z.object({ cycle: z.string().regex(/^\d{4}-\d{2}$/) }), req.body);
    return withTx(ctx.db, async (tx) => {
      const o = (await tx.query("SELECT welfare_amount FROM orgs WHERE id = $1", [m.orgId])).rows[0];
      if (!o.welfare_amount) throw err.badRequest("WELFARE_ZERO", "Set a welfare amount first");
      const ins = await tx.query("INSERT INTO welfare_runs (org_id, cycle, amount, employees, run_by) VALUES ($1,$2,$3,0,$4) ON CONFLICT DO NOTHING RETURNING cycle", [
        m.orgId,
        b.cycle,
        o.welfare_amount,
        req.user!.id,
      ]);
      if (!ins.rowCount) throw err.conflict("WELFARE_DONE", "Welfare for this cycle was already credited");
      const welfare = await orgAccount(tx, m.orgId, "org_welfare");
      const emps = await tx.query(
        `SELECT a.id FROM org_members m JOIN accounts a ON a.org_id = m.org_id AND a.user_id = m.user_id AND a.kind = 'employee'
         WHERE m.org_id = $1 AND m.role = 'employee' AND m.status = 'active'`,
        [m.orgId],
      );
      for (const e of emps.rows) {
        await houseTransfer(tx, {
          type: "welfare",
          orgId: m.orgId,
          from: welfare,
          to: e.id,
          amount: o.welfare_amount,
          by: req.user!.id,
          counterparty: { from: { kind: "welfare", name: `สวัสดิการ ${b.cycle}`, ref: b.cycle } },
        });
      }
      await tx.query("UPDATE welfare_runs SET employees = $3 WHERE org_id = $1 AND cycle = $2", [m.orgId, b.cycle, emps.rowCount]);
      await audit(tx, req.user!.id, "org.welfare_run", req.ip, { cycle: b.cycle, employees: emps.rowCount, amount: o.welfare_amount });
      return { cycle: b.cycle, employees: emps.rowCount, amountEach: o.welfare_amount, total: o.welfare_amount * (emps.rowCount ?? 0) };
    });
  });

  app.get("/org/welfare/runs", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const r = await ctx.db.query("SELECT cycle, amount, employees, created_at FROM welfare_runs WHERE org_id = $1 ORDER BY cycle DESC", [m.orgId]);
    return r.rows;
  });

  // ---------- Payroll deduction (credit mode) ----------
  /** Employees whose balance is below zero = amount to deduct from payroll. */
  app.get("/org/payroll", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const r = await ctx.db.query(
      `SELECT m.id, m.employee_code, m.department, u.display_name, -a.balance AS deduct
       FROM org_members m JOIN users u ON u.id = m.user_id
       JOIN accounts a ON a.org_id = m.org_id AND a.user_id = m.user_id AND a.kind = 'employee'
       WHERE m.org_id = $1 AND m.role = 'employee' AND a.balance < 0 ORDER BY m.employee_code`,
      [m.orgId],
    );
    return {
      asOf: new Date().toISOString(),
      items: r.rows.map((x) => ({ memberId: x.id, code: x.employee_code, name: x.display_name, department: x.department, deduct: x.deduct })),
      total: r.rows.reduce((s, x) => s + x.deduct, 0),
    };
  });

  /** After payroll ran: settle exactly the exported amounts (spending after export stays for next cycle). */
  app.post("/org/payroll/settle", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const b = parse(
      z.object({ cycle: z.string().regex(/^\d{4}-\d{2}$/), items: z.array(z.object({ memberId: z.string().uuid(), amount })).min(1).max(5000) }),
      req.body,
    );
    return withTx(ctx.db, async (tx) => {
      const settlement = await orgAccount(tx, m.orgId, "org_settlement");
      let total = 0;
      for (const it of b.items) {
        const e = await tx.query("SELECT user_id FROM org_members WHERE id = $1 AND org_id = $2 AND role = 'employee'", [it.memberId, m.orgId]);
        if (!e.rowCount) throw err.notFound("EMPLOYEE_NOT_FOUND", `Employee ${it.memberId} not found`);
        const key = `payroll:${b.cycle}:${it.memberId}`;
        const dup = await tx.query("SELECT 1 FROM transactions WHERE initiated_by = $1 AND idempotency_key = $2", [req.user!.id, key]);
        if (dup.rowCount) continue;
        const acc = await employeeAccount(tx, m.orgId, e.rows[0].user_id);
        await houseTransfer(tx, {
          type: "payroll_settle",
          orgId: m.orgId,
          from: settlement,
          to: acc.id,
          amount: it.amount,
          by: req.user!.id,
          counterparty: { from: { kind: "payroll", name: `หักเงินเดือน ${b.cycle}`, ref: b.cycle } },
          key,
        });
        total += it.amount;
      }
      await audit(tx, req.user!.id, "org.payroll_settle", req.ip, { cycle: b.cycle, count: b.items.length, total });
      return { settled: total };
    });
  });

  // ---------- Merchants ----------
  app.get("/org/merchants", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const r = await ctx.db.query(
      `SELECT me.id, me.name, me.status, u.display_name AS owner_name, u.phone AS owner_phone, (u.pin_hash IS NOT NULL) AS activated, a.balance AS payable
       FROM merchants me JOIN accounts a ON a.merchant_id = me.id LEFT JOIN users u ON u.id = me.owner_id
       WHERE me.org_id = $1 ORDER BY me.name`,
      [m.orgId],
    );
    return r.rows.map((x) => ({ id: x.id, name: x.name, status: x.status, ownerName: x.owner_name, ownerPhone: x.owner_phone, activated: x.activated, payable: x.payable }));
  });

  app.post("/org/merchants", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const b = parse(z.object({ name: z.string().trim().min(1).max(60), ownerName: z.string().trim().min(1).max(80), ownerPhone: phone }), req.body);
    return withTx(ctx.db, async (tx) => {
      const org = (await tx.query("SELECT id, money_mode, credit_limit FROM orgs WHERE id = $1", [m.orgId])).rows[0];
      const owner = await upsertMember(tx, org, { role: "merchant", name: b.ownerName, phone: b.ownerPhone });
      const me = await tx.query("INSERT INTO merchants (org_id, name, owner_id) VALUES ($1,$2,$3) RETURNING id", [m.orgId, b.name, owner.userId]);
      await tx.query("INSERT INTO accounts (kind, org_id, merchant_id) VALUES ('merchant', $1, $2)", [m.orgId, me.rows[0].id]);
      await audit(tx, req.user!.id, "org.merchant_created", req.ip, { merchantId: me.rows[0].id });
      return { id: me.rows[0].id };
    });
  });

  app.patch("/org/merchants/:id", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), status: z.enum(["active", "inactive"]).optional() }), req.body);
    const r = await ctx.db.query("UPDATE merchants SET name = COALESCE($3, name), status = COALESCE($4, status) WHERE id = $1 AND org_id = $2 RETURNING id", [
      p.id,
      m.orgId,
      b.name ?? null,
      b.status ?? null,
    ]);
    if (!r.rowCount) throw err.notFound("MERCHANT_NOT_FOUND", "Shop not found");
    return { ok: true };
  });

  /** Record that the company paid the shop (cash/bank transfer outside the system). */
  app.post("/org/merchants/:id/payout", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const p = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ amount, note: z.string().max(100).optional(), idempotencyKey: z.string().min(8).max(80) }), req.body);
    return withTx(ctx.db, async (tx) => {
      const me = await tx.query("SELECT me.name, a.id AS account_id FROM merchants me JOIN accounts a ON a.merchant_id = me.id WHERE me.id = $1 AND me.org_id = $2", [
        p.id,
        m.orgId,
      ]);
      if (!me.rowCount) throw err.notFound("MERCHANT_NOT_FOUND", "Shop not found");
      const dup = await tx.query("SELECT id FROM transactions WHERE initiated_by = $1 AND idempotency_key = $2", [req.user!.id, b.idempotencyKey]);
      if (dup.rowCount) return { id: dup.rows[0].id };
      const t = await houseTransfer(tx, {
        type: "merchant_payout",
        orgId: m.orgId,
        from: me.rows[0].account_id,
        to: await orgAccount(tx, m.orgId, "org_settlement"),
        amount: b.amount,
        by: req.user!.id,
        counterparty: { to: { kind: "merchant", name: me.rows[0].name, ref: p.id }, from: { kind: "hr", name: "จ่ายเงินร้านค้า", ref: "" } },
        note: b.note,
        key: b.idempotencyKey,
        merchantId: p.id,
      });
      await audit(tx, req.user!.id, "org.merchant_payout", req.ip, { merchantId: p.id, amount: b.amount });
      return { id: t.id };
    });
  });

  // ---------- Reports ----------
  app.get("/org/reports/summary", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const q = parse(z.object({ from: dateStr, to: dateStr }), req.query);
    const args = [m.orgId, q.from, q.to];
    const [tot, byShop, byDay, outstanding] = await Promise.all([
      ctx.db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::bigint AS total, COUNT(DISTINCT initiated_by)::int AS buyers
         FROM transactions WHERE org_id = $1 AND type = 'purchase' AND status = 'completed' AND ${range}`,
        args,
      ),
      ctx.db.query(
        `SELECT me.id, me.name, COUNT(t.id)::int AS count, COALESCE(SUM(t.amount),0)::bigint AS total
         FROM merchants me LEFT JOIN transactions t ON t.merchant_id = me.id AND t.type = 'purchase' AND t.status = 'completed'
           AND t.created_at >= ($2::date)::timestamp AT TIME ZONE 'Asia/Bangkok' AND t.created_at < ($3::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok'
         WHERE me.org_id = $1 GROUP BY me.id, me.name ORDER BY total DESC`,
        args,
      ),
      ctx.db.query(
        `SELECT to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count, SUM(amount)::bigint AS total
         FROM transactions WHERE org_id = $1 AND type = 'purchase' AND status = 'completed' AND ${range} GROUP BY 1 ORDER BY 1`,
        args,
      ),
      ctx.db.query(
        `SELECT COALESCE(SUM(-balance) FILTER (WHERE kind = 'employee' AND balance < 0),0)::bigint AS to_deduct,
                COALESCE(SUM(balance) FILTER (WHERE kind = 'merchant'),0)::bigint AS shops_payable
         FROM accounts WHERE org_id = $1`,
        [m.orgId],
      ),
    ]);
    return { ...tot.rows[0], byShop: byShop.rows, byDay: byDay.rows, toDeduct: outstanding.rows[0].to_deduct, shopsPayable: outstanding.rows[0].shops_payable };
  });

  /** Raw purchase log for audits / Excel. */
  app.get("/org/reports/transactions", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const q = parse(z.object({ from: dateStr, to: dateStr }), req.query);
    const r = await ctx.db.query(
      `SELECT t.id, t.type, t.amount, t.channel, t.created_at, t.counterparty->'from'->>'name' AS employee,
              t.counterparty->'from'->>'ref' AS employee_code, me.name AS shop
       FROM transactions t LEFT JOIN merchants me ON me.id = t.merchant_id
       WHERE t.org_id = $1 AND t.status = 'completed' AND ${range.replaceAll("created_at", "t.created_at")}
       ORDER BY t.created_at DESC LIMIT 20000`,
      [m.orgId, q.from, q.to],
    );
    return r.rows;
  });

  // ---------- Staff ----------
  app.post("/org/hr-staff", async (req) => {
    const m = await requireRole(ctx, req, "hr");
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), phone }), req.body);
    return withTx(ctx.db, async (tx) => {
      const org = (await tx.query("SELECT id, money_mode, credit_limit FROM orgs WHERE id = $1", [m.orgId])).rows[0];
      const r = await upsertMember(tx, org, { role: "hr", name: b.name, phone: b.phone });
      await audit(tx, req.user!.id, "org.hr_added", req.ip, { userId: r.userId });
      return { ok: true };
    });
  });
}
