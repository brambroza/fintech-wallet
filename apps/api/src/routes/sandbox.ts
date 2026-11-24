import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { err } from "../lib/errors.js";
import { parse, phone } from "../lib/validate.js";
import { applyKycDecision } from "./kyc.js";

/** Back-office stand-ins for the sandbox only. Never registered when SANDBOX=false. */
export default async function sandboxRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.post("/sandbox/kyc/decide", async (req) => {
    const b = parse(
      z.object({ phone, decision: z.enum(["approved", "rejected"]), reason: z.string().max(200).optional() }),
      req.body,
    );
    const u = await ctx.db.query("SELECT id, kyc_status FROM users WHERE phone = $1", [b.phone]);
    if (!u.rowCount) throw err.notFound("USER_NOT_FOUND", "User not found");
    if (u.rows[0].kyc_status !== "pending") throw err.conflict("KYC_NOT_PENDING", "No pending submission");
    await applyKycDecision(
      ctx,
      u.rows[0].id,
      b.decision === "approved" ? { status: "approved" } : { status: "rejected", reason: b.reason ?? "เอกสารไม่ชัดเจน" },
    );
    return { ok: true };
  });
}
