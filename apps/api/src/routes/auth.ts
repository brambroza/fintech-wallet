import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppCtx } from "../context.js";
import { withTx } from "../db.js";
import { err } from "../lib/errors.js";
import { hashPin, isWeakPin } from "../lib/crypto.js";
import { deviceId, maskPhone, parse, phone, pin } from "../lib/validate.js";
import { audit, authenticate, checkPin, consumeOtp, createOtp, issueTokens, rotateRefresh } from "../services/auth.js";

export default async function authRoutes(app: FastifyInstance, ctx: AppCtx) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  /** Step 1 of register: send OTP to a phone that is not registered yet. (Consumer wallet only.) */
  app.post("/auth/register/otp", strict, async (req) => {
    if (!ctx.cfg.CONSUMER_WALLET) throw err.notFound("NOT_FOUND", "Not found");
    const b = parse(z.object({ phone, deviceId }), req.body);
    const exists = await ctx.db.query("SELECT 1 FROM users WHERE phone = $1", [b.phone]);
    if (exists.rowCount) throw err.conflict("PHONE_TAKEN", "This number is already registered");
    return createOtp(ctx, b.phone, "register", b.deviceId);
  });

  /** Step 2: verify OTP + set PIN in one call; creates user, wallet and trusted device. */
  app.post("/auth/register", strict, async (req) => {
    if (!ctx.cfg.CONSUMER_WALLET) throw err.notFound("NOT_FOUND", "Not found");
    const b = parse(
      z.object({ otpId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), pin, deviceId, displayName: z.string().trim().min(1).max(60) }),
      req.body,
    );
    if (isWeakPin(b.pin)) throw err.badRequest("PIN_WEAK", "PIN is too easy to guess");
    const { phone: p } = await consumeOtp(ctx, b.otpId, b.code, { purpose: "register", deviceId: b.deviceId });
    const pinHash = await hashPin(b.pin);
    return withTx(ctx.db, async (tx) => {
      const u = await tx.query(
        "INSERT INTO users (phone, display_name, pin_hash) VALUES ($1,$2,$3) ON CONFLICT (phone) DO NOTHING RETURNING id",
        [p, b.displayName, pinHash],
      );
      if (!u.rowCount) throw err.conflict("PHONE_TAKEN", "This number is already registered");
      const userId = u.rows[0].id;
      await tx.query("INSERT INTO accounts (kind, user_id) VALUES ('user', $1)", [userId]);
      await tx.query("INSERT INTO devices (user_id, device_id) VALUES ($1, $2)", [userId, b.deviceId]);
      await audit(tx, userId, "user.registered", req.ip);
      return issueTokens(ctx, tx, userId, b.deviceId);
    });
  });

  /** Login = phone + PIN. Unknown device → OTP step (device binding). */
  app.post("/auth/login", strict, async (req) => {
    const b = parse(z.object({ phone, pin, deviceId }), req.body);
    const u = await ctx.db.query("SELECT id FROM users WHERE phone = $1", [b.phone]);
    if (!u.rowCount) throw err.badRequest("LOGIN_FAILED", "Phone or PIN is incorrect");
    const userId = u.rows[0].id;
    await checkPin(ctx, userId, b.pin);
    const dev = await ctx.db.query("SELECT 1 FROM devices WHERE user_id = $1 AND device_id = $2", [userId, b.deviceId]);
    if (!dev.rowCount) {
      const otp = await createOtp(ctx, b.phone, "login", b.deviceId);
      return { otpRequired: true, maskedPhone: maskPhone(b.phone), ...otp };
    }
    await ctx.db.query("UPDATE devices SET last_seen = now() WHERE user_id = $1 AND device_id = $2", [userId, b.deviceId]);
    await audit(ctx.db, userId, "auth.login", req.ip);
    return { otpRequired: false, ...(await issueTokens(ctx, ctx.db, userId, b.deviceId)) };
  });

  app.post("/auth/login/verify", strict, async (req) => {
    const b = parse(z.object({ otpId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), deviceId }), req.body);
    const { phone: p } = await consumeOtp(ctx, b.otpId, b.code, { purpose: "login", deviceId: b.deviceId });
    return withTx(ctx.db, async (tx) => {
      const u = await tx.query("SELECT id FROM users WHERE phone = $1", [p]);
      if (!u.rowCount) throw err.badRequest("LOGIN_FAILED", "Phone or PIN is incorrect");
      const userId = u.rows[0].id;
      await tx.query(
        "INSERT INTO devices (user_id, device_id) VALUES ($1,$2) ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen = now()",
        [userId, b.deviceId],
      );
      await audit(tx, userId, "device.trusted", req.ip, { deviceId: b.deviceId });
      return issueTokens(ctx, tx, userId, b.deviceId);
    });
  });

  app.post("/auth/refresh", strict, async (req) => {
    const b = parse(z.object({ refreshToken: z.string().min(20), deviceId }), req.body);
    return withTx(ctx.db, (tx) => rotateRefresh(ctx, tx, b.refreshToken, b.deviceId));
  });

  /** Unlock the app (returning user with a session) — server-checked so lockout applies. */
  app.post("/auth/pin/verify", strict, async (req) => {
    await authenticate(ctx, req);
    const b = parse(z.object({ pin }), req.body);
    await checkPin(ctx, req.user!.id, b.pin);
    return { ok: true };
  });

  app.post("/auth/pin/change", strict, async (req) => {
    await authenticate(ctx, req);
    const b = parse(z.object({ currentPin: pin, newPin: pin }), req.body);
    if (isWeakPin(b.newPin)) throw err.badRequest("PIN_WEAK", "PIN is too easy to guess");
    await checkPin(ctx, req.user!.id, b.currentPin);
    await ctx.db.query("UPDATE users SET pin_hash = $2 WHERE id = $1", [req.user!.id, await hashPin(b.newPin)]);
    await audit(ctx.db, req.user!.id, "pin.changed", req.ip);
    return { ok: true };
  });

  app.post("/auth/logout", async (req) => {
    await authenticate(ctx, req);
    await ctx.db.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL",
      [req.user!.id, req.user!.deviceId],
    );
    await audit(ctx.db, req.user!.id, "auth.logout", req.ip);
    return { ok: true };
  });
}
