import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const otpCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const PIN_COST = 12;
export const hashPin = (pin: string) => bcrypt.hash(pin, PIN_COST);
export const verifyPin = (pin: string, hash: string) => bcrypt.compare(pin, hash);

/** Reject trivially guessable PINs (all same digit, straight sequences). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const seqUp = "0123456789";
  const seqDown = "9876543210";
  return seqUp.includes(pin) || seqDown.includes(pin);
}
