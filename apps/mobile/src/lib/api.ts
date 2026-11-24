import Constants from "expo-constants";
import { session } from "./session";

const BASE = `${(Constants.expoConfig?.extra?.apiUrl as string) ?? "http://localhost:4000"}/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// ---------- types (mirror apps/api canteen routes) ----------
export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type OtpChallenge = { otpId: string; expiresAt: string; code?: string };
export type Wallet = {
  orgId: string;
  orgName: string;
  mode: "credit" | "prepaid";
  balance: number;
  available: number;
  creditLimit: number;
  dailyLimit: number;
  spentToday: number;
  welfareAmount: number;
};
export type Me = {
  id: string;
  phone: string | null;
  displayName: string;
  lineLinked: boolean;
  roles: { role: "employee" | "hr" | "merchant"; orgId: string; orgName: string }[];
  wallet: Wallet | null;
};
export type Party = { kind: string; name: string; ref: string };
export type Txn = {
  id: string;
  type: "purchase" | "welfare" | "payroll_settle" | "topup" | "refund" | string;
  status: "pending" | "completed" | "failed";
  amount: number;
  delta: number;
  direction: "in" | "out";
  counterparty: Party | null;
  channel: string | null;
  note: string | null;
  createdAt: string;
};
export type PayTarget = { merchantId: string; merchantName: string; amount: number | null; chargeId: string | null };

// ---------- transport ----------
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = await session.getRefresh();
      if (!rt) return false;
      const t = await raw<Tokens>("POST", "/auth/refresh", { refreshToken: rt, deviceId: await session.deviceId() }, false);
      await session.saveTokens(t);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const token = session.getAccess();
  if (auth && token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "NETWORK", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error ?? {};
    throw new ApiError(res.status, e.code ?? "UNKNOWN", e.message ?? "Request failed", e);
  }
  return json as T;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!session.getAccess()) await refresh();
  try {
    return await raw<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await refresh())) return raw<T>(method, path, body);
    throw e;
  }
}

// ---------- endpoints ----------
export const api = {
  refresh,
  activateOtp: async (phone: string) => raw<OtpChallenge>("POST", "/auth/activate/otp", { phone, deviceId: await session.deviceId() }, false),
  activate: async (otpId: string, code: string, pin: string) =>
    raw<Tokens>("POST", "/auth/activate", { otpId, code, pin, deviceId: await session.deviceId() }, false),
  login: async (phone: string, pin: string) =>
    raw<({ otpRequired: false } & Tokens) | ({ otpRequired: true; maskedPhone: string } & OtpChallenge)>(
      "POST",
      "/auth/login",
      { phone, pin, deviceId: await session.deviceId() },
      false,
    ),
  loginVerify: async (otpId: string, code: string) =>
    raw<Tokens>("POST", "/auth/login/verify", { otpId, code, deviceId: await session.deviceId() }, false),
  verifyPin: (pin: string) => call<{ ok: true }>("POST", "/auth/pin/verify", { pin }),
  changePin: (currentPin: string, newPin: string) => call<{ ok: true }>("POST", "/auth/pin/change", { currentPin, newPin }),
  logout: () => call<{ ok: true }>("POST", "/auth/logout"),

  me: () => call<Me>("GET", "/canteen/me"),
  resolve: (qr: string) => call<PayTarget>("POST", "/canteen/pay/resolve", { qr }),
  pay: (b: { merchantId: string; chargeId?: string | null; amount: number; pin: string; idempotencyKey: string }) =>
    call<Txn>("POST", "/canteen/pay", { ...b, chargeId: b.chargeId ?? undefined, channel: "app" }),
  transactions: (cursor?: number | null) =>
    call<{ items: Txn[]; nextCursor: number | null }>("GET", `/canteen/transactions${cursor ? `?cursor=${cursor}` : ""}`),
};

/** Thai, user-facing message for an API error. */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
  const left = e.data.attemptsLeft as number | undefined;
  const map: Record<string, string> = {
    NETWORK: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    NOT_INVITED: "เบอร์นี้ยังไม่ได้ถูกเพิ่มโดยฝ่ายบุคคล",
    ALREADY_ACTIVE: "เปิดใช้งานแล้ว เข้าสู่ระบบได้เลย",
    NOT_ACTIVATED: "บัญชียังไม่ได้เปิดใช้งาน",
    OTP_INVALID: "รหัส OTP ไม่ถูกต้อง",
    OTP_EXPIRED: "รหัส OTP หมดอายุ ขอรหัสใหม่",
    OTP_TOO_MANY_ATTEMPTS: "ใส่รหัสผิดหลายครั้ง ขอรหัสใหม่",
    RATE_LIMITED: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่",
    PIN_WEAK: "PIN ง่ายเกินไป หลีกเลี่ยงเลขเรียงหรือเลขซ้ำ",
    PIN_INVALID: left !== undefined ? `PIN ไม่ถูกต้อง เหลืออีก ${left} ครั้ง` : "PIN ไม่ถูกต้อง",
    LOCKED: "ใส่ PIN ผิดหลายครั้ง ล็อก 15 นาที",
    LOGIN_FAILED: "เบอร์โทรหรือ PIN ไม่ถูกต้อง",
    ROLE_REQUIRED: "บัญชีนี้ไม่ได้เป็นพนักงานในระบบโรงอาหาร",
    INSUFFICIENT_FUNDS: "ยอดเงินหรือวงเงินไม่พอ",
    DAILY_LIMIT: "เกินวงเงินใช้จ่ายต่อวัน",
    QR_INVALID: "QR นี้ไม่ใช่ QR ร้านในโรงอาหาร",
    CHARGE_CLOSED: "QR นี้ถูกใช้ไปแล้ว",
    CHARGE_EXPIRED: "QR หมดอายุ ให้ร้านสร้างใหม่",
    AMOUNT_MISMATCH: "ยอดเงินไม่ตรงกับที่ร้านเรียกเก็บ",
    MERCHANT_NOT_FOUND: "ไม่พบร้านค้า",
    EMPLOYEE_INACTIVE: "บัญชีถูกระงับ ติดต่อฝ่ายบุคคล",
    VALIDATION: "ข้อมูลไม่ถูกต้อง",
  };
  return map[e.code] ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
}
