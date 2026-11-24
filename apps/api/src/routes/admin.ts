import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { parse, phone } from "../lib/validate.js";
import { audit } from "../services/auth.js";
import { createOrg, upsertMember } from "../services/canteen.js";

/** GO Along operator endpoints (onboard a new factory). Enabled only when ADMIN_TOKEN is set. */
export default async function adminRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.addHook("preHandler", async (req) => {
    const got = Buffer.from(String(req.headers["x-admin-token"] ?? ""));
    const want = Buffer.from(ctx.cfg.ADMIN_TOKEN ?? "");
    if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) throw err.unauthorized("ADMIN_ONLY", "Admin token required");
  });

  app.post("/admin/orgs", async (req) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
        moneyMode: z.enum(["credit", "prepaid"]).default("credit"),
        hr: z.object({ name: z.string().trim().min(1).max(80), phone }),
      }),
      req.body,
    );
    return withTx(ctx.db, async (tx) => {
      const exists = await tx.query("SELECT 1 FROM orgs WHERE code = $1", [b.code]);
      if (exists.rowCount) throw err.conflict("ORG_CODE_TAKEN", "Org code already used");
      const org = await createOrg(tx, { name: b.name, code: b.code, moneyMode: b.moneyMode });
      await upsertMember(tx, org, { role: "hr", name: b.hr.name, phone: b.hr.phone });
      await audit(tx, null, "admin.org_created", req.ip, { orgId: org.id, code: b.code });
      return { id: org.id, code: org.code };
    });
  });

  app.get("/admin/orgs", async () => {
    const r = await ctx.db.query(
      `SELECT o.id, o.name, o.code, o.money_mode, o.created_at,
              (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id AND m.role = 'employee' AND m.status = 'active')::int AS employees
       FROM orgs o ORDER BY o.created_at DESC`,
    );
    return r.rows;
  });
}
