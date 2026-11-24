import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { audit, authenticate } from "../services/auth.js";

// Images travel to the KYC vendor; we keep only the vendor reference (no PII images at rest here).
const image = z.string().min(100).max(8_000_000);

export async function applyKycDecision(
  ctx: AppCtx,
  userId: string,
  decision: { status: "approved" } | { status: "rejected"; reason: string },
) {
  await withTx(ctx.db, async (tx) => {
    await tx.query(
      `UPDATE kyc_submissions SET status = $2, reason = $3, decided_at = now()
       WHERE id = (SELECT id FROM kyc_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
      [userId, decision.status, decision.status === "rejected" ? decision.reason : null],
    );
    await tx.query("UPDATE users SET kyc_status = $2, kyc_reason = $3 WHERE id = $1", [
      userId,
      decision.status,
      decision.status === "rejected" ? decision.reason : null,
    ]);
    await audit(tx, userId, `kyc.${decision.status}`);
  });
}

export default async function kycRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.get("/kyc", async (req) => {
    await authenticate(ctx, req);
    const r = await ctx.db.query("SELECT kyc_status AS status, kyc_reason AS reason FROM users WHERE id = $1", [req.user!.id]);
    return r.rows[0];
  });

  app.post("/kyc/submit", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req) => {
    await authenticate(ctx, req);
    const b = parse(
      z.discriminatedUnion("method", [
        z.object({ method: z.literal("id_card"), idCardImage: image, selfieImage: image }),
        z.object({ method: z.literal("ndid") }),
      ]),
      req.body,
    );
    const userId = req.user!.id;
    const cur = await ctx.db.query("SELECT kyc_status FROM users WHERE id = $1", [userId]);
    if (cur.rows[0].kyc_status === "approved") throw err.conflict("KYC_DONE", "Identity already verified");
    if (cur.rows[0].kyc_status === "pending") throw err.conflict("KYC_PENDING", "Verification in progress");

    const res = await ctx.providers.kyc.submit({ userId, ...b });
    await ctx.db.query("INSERT INTO kyc_submissions (user_id, method, provider_ref) VALUES ($1,$2,$3)", [
      userId,
      b.method,
      res.providerRef,
    ]);
    await ctx.db.query("UPDATE users SET kyc_status = 'pending', kyc_reason = NULL WHERE id = $1", [userId]);
    await audit(ctx.db, userId, "kyc.submitted", req.ip, { method: b.method });
    if (res.decision.status !== "pending") await applyKycDecision(ctx, userId, res.decision);
    const r = await ctx.db.query("SELECT kyc_status AS status, kyc_reason AS reason FROM users WHERE id = $1", [userId]);
    return r.rows[0];
  });
}
