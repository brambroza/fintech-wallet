import { z } from "zod";
import { err } from "./errors.js";

/** Thai mobile number, normalised to 0XXXXXXXXX. Accepts +66 / 66 prefixes. */
export const phone = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, "").replace(/^\+?66/, "0"))
  .refine((s) => /^0[689]\d{8}$/.test(s), "Invalid Thai mobile number");

export const pin = z.string().regex(/^\d{6}$/, "PIN must be 6 digits");
export const deviceId = z.string().min(8).max(128);
/** Satang, positive integer, max ฿2,000,000 per request. */
export const amount = z.number().int().positive().max(200_000_000);

export function parse<T extends z.ZodTypeAny>(s: T, data: unknown): z.infer<T> {
  const r = s.safeParse(data);
  if (!r.success) {
    throw err.badRequest("VALIDATION", "Invalid request", { issues: r.error.flatten() });
  }
  return r.data;
}

export const maskPhone = (p: string) => `${p.slice(0, 3)}-xxx-${p.slice(-4)}`;
export const maskAccount = (a: string) => `•••• ${a.slice(-4)}`;
