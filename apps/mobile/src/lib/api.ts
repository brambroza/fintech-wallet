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

// ---------- types (mirror apps/api) ----------
export type KycStatus = "none" | "pending" | "approved" | "rejected";
export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type OtpChallenge = { otpId: string; expiresAt: string; code?: string };
export type Me = { id: string; phone: string; displayName: string; kyc: { status: KycStatus; reason: string | null }; balance: number; dailyLimit: number };
export type Target =
  | { kind: "wallet"; phone: string }
  | { kind: "promptpay"; id: string }
  | { kind: "bank"; bankCode: string; accountNo: string };
export type Party = { kind: string; name: string; ref: string; target?: Target };
export type Txn = {
  id: string;
  type: "p2p" | "topup" | "payout" | "goal_deposit" | "reversal";
  status: "pending" | "completed" | "failed";
  amount: number;
  fee: number;
  delta: number;
  direction: "in" | "out";
  counterparty: Party | null;
  note: string | null;
  failureReason: string | null;
  createdAt: string;
};
export type Quote = { to: Party; amount: number; fee: number; total: number };
export type Goal = { id: string; name: string; target: number; saved: number };

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
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = session.getAccess();
  if (auth && token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "NETWORK", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
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
  registerOtp: async (phone: string) =>
    raw<OtpChallenge>("POST", "/auth/register/otp", { phone, deviceId: await session.deviceId() }, false),
  register: async (b: { otpId: string; code: string; pin: string; displayName: string }) =>
    raw<Tokens>("POST", "/auth/register", { ...b, deviceId: await session.deviceId() }, false),
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

  me: () => call<Me>("GET", "/me"),
  kyc: () => call<{ status: KycStatus; reason: string | null }>("GET", "/kyc"),
  submitKyc: (b: { method: "id_card"; idCardImage: string; selfieImage: string } | { method: "ndid" }) =>
    call<{ status: KycStatus; reason: string | null }>("POST", "/kyc/submit", b),

  transactions: (p: { cursor?: number | null; filter?: "all" | "in" | "out"; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (p.cursor) q.set("cursor", String(p.cursor));
    q.set("filter", p.filter ?? "all");
    q.set("limit", String(p.limit ?? 20));
    return call<{ items: Txn[]; nextCursor: number | null }>("GET", `/wallet/transactions?${q}`);
  },
  topup: (amount: number, idempotencyKey: string) => call<Txn>("POST", "/wallet/topup", { amount, idempotencyKey }),
  quote: (to: Target, amount: number) => call<Quote>("POST", "/transfers/quote", { to, amount }),
  transfer: (b: { to: Target; amount: number; pin: string; note?: string; idempotencyKey: string }) =>
    call<Txn>("POST", "/transfers", b),
  recents: () => call<Party[]>("GET", "/transfers/recents"),
  goals: () => call<Goal[]>("GET", "/goals"),
  createGoal: (name: string, target: number) => call<Goal>("POST", "/goals", { name, target }),
  moveGoal: (id: string, amount: number, direction: "deposit" | "withdraw") =>
    call<{ id: string; saved: number }>("POST", `/goals/${id}/move`, { amount, direction }),
  insights: () => call<{ spent: number; byType: Record<string, number> }>("GET", "/insights/month"),
};

/** Thai, user-facing message for an API error. */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
  const left = e.data.attemptsLeft as number | undefined;
  const map: Record<string, string> = {
    NETWORK: e.message,
    PHONE_TAKEN: "เบอร์นี้สมัครไว้แล้ว เข้าสู่ระบบแทน",
    OTP_INVALID: "รหัส OTP ไม่ถูกต้อง",
    OTP_EXPIRED: "รหัส OTP หมดอายุ ขอรหัสใหม่",
    OTP_TOO_MANY_ATTEMPTS: "ใส่รหัสผิดหลายครั้ง ขอรหัสใหม่",
    RATE_LIMITED: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่",
    PIN_WEAK: "PIN ง่ายเกินไป หลีกเลี่ยงเลขเรียงหรือเลขซ้ำ",
    PIN_INVALID: left !== undefined ? `PIN ไม่ถูกต้อง เหลืออีก ${left} ครั้ง` : "PIN ไม่ถูกต้อง",
    LOCKED: "ใส่ PIN ผิดหลายครั้ง ล็อก 15 นาที",
    LOGIN_FAILED: "เบอร์โทรหรือ PIN ไม่ถูกต้อง",
    KYC_REQUIRED: "ต้องยืนยันตัวตนก่อนจึงจะโอนหรือเติมเงินได้",
    KYC_PENDING: "กำลังตรวจสอบตัวตนอยู่",
    INSUFFICIENT_FUNDS: "ยอดเงินในบัญชีไม่พอ",
    DAILY_LIMIT: "เกินวงเงินโอนต่อวัน",
    RECIPIENT_NOT_FOUND: "ไม่พบบัญชีผู้รับ",
    SELF_TRANSFER: "โอนเข้าบัญชีตัวเองไม่ได้",
    VALIDATION: "ข้อมูลไม่ถูกต้อง",
  };
  return map[e.code] ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
}
