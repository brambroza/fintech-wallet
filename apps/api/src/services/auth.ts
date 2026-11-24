import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import type { AppCtx } from "../context.js";
import type { Db, Tx } from "../db.js";
import { err } from "../lib/errors.js";
import { hmac, otpCode, randomToken, safeEqualHex, sha256, verifyPin } from "../lib/crypto.js";

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_GAP_MS = 30_000;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 15 * 60_000;

export async function audit(db: Db | Tx, userId: string | null, action: string, ip?: string, meta: object = {}) {
  await db.query("INSERT INTO audit_log (user_id, action, ip, meta) VALUES ($1, $2, $3, $4)", [userId, action, ip ?? null, meta]);
}

// ---------- OTP ----------
export async function createOtp(
  ctx: AppCtx,
  phone: string,
  purpose: "register" | "login",
  deviceId: string,
): Promise<{ otpId: string; expiresAt: Date; code?: string }> {
  const last = await ctx.db.query(
    "SELECT created_at FROM otp_challenges WHERE phone = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1",
    [phone, purpose],
  );
  if (last.rowCount && Date.now() - new Date(last.rows[0].created_at).getTime() < OTP_RESEND_GAP_MS) {
    throw err.tooMany("Please wait before requesting another code");
  }
  const code = otpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const r = await ctx.db.query(
    "INSERT INTO otp_challenges (phone, purpose, device_id, code_hash, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [phone, purpose, deviceId, hmac(ctx.cfg.OTP_PEPPER, code), expiresAt],
  );
  await ctx.providers.sms.send(phone, `รหัส OTP ของคุณคือ ${code} (หมดอายุใน 5 นาที) ห้ามบอกรหัสนี้กับผู้อื่น`);
  return { otpId: r.rows[0].id, expiresAt, ...(ctx.cfg.SANDBOX && ctx.cfg.SANDBOX_EXPOSE_OTP ? { code } : {}) };
}

/**
 * Verifies and consumes an OTP atomically (single UPDATE, so a code can be used once
 * even under concurrent requests). Runs on its own connection so failed attempts are
 * always counted.
 */
export async function consumeOtp(
  ctx: AppCtx,
  otpId: string,
  code: string,
  expect: { purpose: "register" | "login"; deviceId: string; phone?: string },
): Promise<{ phone: string }> {
  const r = await ctx.db.query("SELECT * FROM otp_challenges WHERE id = $1", [otpId]);
  const c = r.rows[0];
  if (!c || c.purpose !== expect.purpose || c.device_id !== expect.deviceId || (expect.phone && c.phone !== expect.phone)) {
    throw err.badRequest("OTP_INVALID", "Invalid code");
  }
  if (c.consumed_at || new Date(c.expires_at) < new Date()) throw err.badRequest("OTP_EXPIRED", "Code expired");
  if (c.attempts >= OTP_MAX_ATTEMPTS) throw err.badRequest("OTP_TOO_MANY_ATTEMPTS", "Too many attempts, request a new code");
  if (!safeEqualHex(hmac(ctx.cfg.OTP_PEPPER, code), c.code_hash)) {
    await ctx.db.query("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1", [otpId]);
    throw err.badRequest("OTP_INVALID", "Invalid code");
  }
  const u = await ctx.db.query(
    "UPDATE otp_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING phone",
    [otpId],
  );
  if (!u.rowCount) throw err.badRequest("OTP_EXPIRED", "Code expired");
  return { phone: c.phone };
}

// ---------- PIN ----------
/** Checks a user's PIN with lockout. Failures are committed outside any caller transaction. */
export async function checkPin(ctx: AppCtx, userId: string, pin: string): Promise<void> {
  const r = await ctx.db.query("SELECT pin_hash, pin_failed, pin_locked_until FROM users WHERE id = $1", [userId]);
  const u = r.rows[0];
  if (!u) throw err.unauthorized();
  if (u.pin_locked_until && new Date(u.pin_locked_until) > new Date()) {
    throw err.locked("PIN locked, try again later", { until: u.pin_locked_until });
  }
  if (await verifyPin(pin, u.pin_hash)) {
    if (u.pin_failed) await ctx.db.query("UPDATE users SET pin_failed = 0, pin_locked_until = NULL WHERE id = $1", [userId]);
    return;
  }
  const fails = u.pin_failed + 1;
  if (fails >= PIN_MAX_FAILS) {
    await ctx.db.query("UPDATE users SET pin_failed = 0, pin_locked_until = $2 WHERE id = $1", [
      userId,
      new Date(Date.now() + PIN_LOCK_MS),
    ]);
    await audit(ctx.db, userId, "pin.locked");
    throw err.locked("Too many wrong PINs. Locked for 15 minutes");
  }
  await ctx.db.query("UPDATE users SET pin_failed = $2 WHERE id = $1", [userId, fails]);
  throw err.badRequest("PIN_INVALID", "Wrong PIN", { attemptsLeft: PIN_MAX_FAILS - fails });
}

// ---------- Tokens ----------
const key = (ctx: AppCtx) => new TextEncoder().encode(ctx.cfg.JWT_SECRET);

export async function issueTokens(ctx: AppCtx, db: Db | Tx, userId: string, deviceId: string, familyId = randomUUID()) {
  const accessToken = await new SignJWT({ did: deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ctx.cfg.ACCESS_TTL_SEC}s`)
    .setAudience("fintech-wallet")
    .sign(key(ctx));
  const refreshToken = randomToken();
  await db.query(
    "INSERT INTO refresh_tokens (user_id, device_id, family_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [userId, deviceId, familyId, sha256(refreshToken), new Date(Date.now() + ctx.cfg.REFRESH_TTL_DAYS * 86_400_000)],
  );
  return { accessToken, refreshToken, expiresIn: ctx.cfg.ACCESS_TTL_SEC };
}

/** Rotating refresh tokens with reuse detection: replaying a used token revokes the whole family. */
export async function rotateRefresh(ctx: AppCtx, tx: Tx, token: string, deviceId: string) {
  const r = await tx.query("SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE", [sha256(token)]);
  const row = r.rows[0];
  if (!row || row.device_id !== deviceId) throw err.unauthorized("REFRESH_INVALID", "Session expired");
  if (row.revoked_at) {
    await ctx.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL", [
      row.family_id,
    ]);
    await audit(ctx.db, row.user_id, "refresh.reuse_detected", undefined, { deviceId });
    throw err.unauthorized("REFRESH_REUSED", "Session expired");
  }
  if (new Date(row.expires_at) < new Date()) throw err.unauthorized("REFRESH_INVALID", "Session expired");
  await tx.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
  return issueTokens(ctx, tx, row.user_id, deviceId, row.family_id);
}

export async function authenticate(ctx: AppCtx, req: FastifyRequest): Promise<void> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw err.unauthorized();
  try {
    const { payload } = await jwtVerify(h.slice(7), key(ctx), { audience: "fintech-wallet" });
    req.user = { id: String(payload.sub), deviceId: String(payload.did) };
  } catch {
    throw err.unauthorized("TOKEN_INVALID", "Session expired");
  }
}
