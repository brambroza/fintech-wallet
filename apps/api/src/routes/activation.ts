import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { hashPin, isWeakPin } from "../lib/crypto.js";
import { deviceId, parse, phone, pin } from "../lib/validate.js";
import { audit, authenticate, consumeOtp, createOtp, issueTokens } from "../services/auth.js";

/**
 * Accounts created by HR (employees, HR staff, shop owners) are activated by their owner:
 * phone → OTP → choose PIN. LINE (LIFF) can then be linked for one-tap login.
 */
export default async function activationRoutes(app: FastifyInstance, ctx: AppCtx) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/auth/activate/otp", strict, async (req) => {
    const b = parse(z.object({ phone, deviceId }), req.body);
    const u = await ctx.db.query("SELECT pin_hash FROM users WHERE phone = $1", [b.phone]);
    // Same answer whether or not the phone exists would hide membership, but HR-issued accounts are
    // expected to exist; we return a specific code so employees know to contact HR.
    if (!u.rowCount) throw err.notFound("NOT_INVITED", "This number has not been added by your company");
    if (u.rows[0].pin_hash) throw err.conflict("ALREADY_ACTIVE", "Already activated, log in instead");
    return createOtp(ctx, b.phone, "activate", b.deviceId);
  });

  app.post("/auth/activate", strict, async (req) => {
    const b = parse(z.object({ otpId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), pin, deviceId }), req.body);
    if (isWeakPin(b.pin)) throw err.badRequest("PIN_WEAK", "PIN is too easy to guess");
    const { phone: p } = await consumeOtp(ctx, b.otpId, b.code, { purpose: "activate", deviceId: b.deviceId });
    const pinHash = await hashPin(b.pin);
    return withTx(ctx.db, async (tx) => {
      const u = await tx.query("UPDATE users SET pin_hash = $2 WHERE phone = $1 AND pin_hash IS NULL RETURNING id", [p, pinHash]);
      if (!u.rowCount) throw err.conflict("ALREADY_ACTIVE", "Already activated, log in instead");
      const userId = u.rows[0].id;
      await tx.query(
        "INSERT INTO devices (user_id, device_id) VALUES ($1,$2) ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen = now()",
        [userId, b.deviceId],
      );
      await audit(tx, userId, "user.activated", req.ip);
      return issueTokens(ctx, tx, userId, b.deviceId);
    });
  });

  /** Link the signed-in user to their LINE account (from inside LIFF). */
  app.post("/auth/line/link", strict, async (req) => {
    await authenticate(ctx, req);
    const b = parse(z.object({ idToken: z.string().min(10) }), req.body);
    const v = await ctx.providers.line.verify(b.idToken);
    if (!v) throw err.unauthorized("LINE_TOKEN_INVALID", "LINE sign-in failed");
    const taken = await ctx.db.query("SELECT id FROM users WHERE line_user_id = $1", [v.sub]);
    if (taken.rowCount && taken.rows[0].id !== req.user!.id) throw err.conflict("LINE_TAKEN", "This LINE account is linked to someone else");
    await ctx.db.query("UPDATE users SET line_user_id = $2 WHERE id = $1", [req.user!.id, v.sub]);
    await audit(ctx.db, req.user!.id, "line.linked", req.ip);
    return { ok: true };
  });

  /** One-tap login inside LIFF for a linked LINE account. Payments still need the PIN. */
  app.post("/auth/line/login", strict, async (req) => {
    const b = parse(z.object({ idToken: z.string().min(10), deviceId }), req.body);
    const v = await ctx.providers.line.verify(b.idToken);
    if (!v) throw err.unauthorized("LINE_TOKEN_INVALID", "LINE sign-in failed");
    const u = await ctx.db.query("SELECT id, pin_hash FROM users WHERE line_user_id = $1", [v.sub]);
    if (!u.rowCount) return { linked: false };
    if (!u.rows[0].pin_hash) throw err.forbidden("NOT_ACTIVATED", "Account not activated yet");
    await audit(ctx.db, u.rows[0].id, "auth.line_login", req.ip);
    return { linked: true, ...(await issueTokens(ctx, ctx.db, u.rows[0].id, b.deviceId)) };
  });
}
