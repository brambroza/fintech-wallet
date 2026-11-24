import { CONFIG } from 'src/config-global';

// ----------------------------------------------------------------------

/**
 * API client for apps/api. Access token lives in memory; the refresh token in localStorage
 * (rotated on every use, revoked on reuse by the server). Amounts are integer satang.
 */
const BASE = `${CONFIG.site.serverUrl || 'http://localhost:4000'}/v1`;
const RT_KEY = 'cw.refresh';
const DEV_KEY = 'cw.device';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

let access: string | null = null;

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export function deviceId(): string {
  let id = safeGet(DEV_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(DEV_KEY, id);
  }
  return id;
}

export const session = {
  hasRefresh: () => !!safeGet(RT_KEY),
  save(t: { accessToken: string; refreshToken: string }) {
    access = t.accessToken;
    safeSet(RT_KEY, t.refreshToken);
  },
  clear() {
    access = null;
    safeSet(RT_KEY, null);
  },
};

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && access) headers.authorization = `Bearer ${access}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error ?? {};
    throw new ApiError(res.status, e.code ?? 'UNKNOWN', e.message ?? 'Request failed', e);
  }
  return json as T;
}

let refreshing: Promise<boolean> | null = null;
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = safeGet(RT_KEY);
      if (!rt) return false;
      session.save(await raw<Tokens>('POST', '/auth/refresh', { refreshToken: rt, deviceId: deviceId() }, false));
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!access) await refresh();
  try {
    return await raw<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await refresh())) return raw<T>(method, path, body);
    throw e;
  }
}

// ---------- types ----------
export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type Otp = { otpId: string; expiresAt: string; code?: string };
export type Role = 'employee' | 'hr' | 'merchant';
export type Me = {
  id: string;
  phone: string | null;
  displayName: string;
  lineLinked: boolean;
  roles: { role: Role; orgId: string; orgName: string; merchantId: string | null; merchantName: string | null }[];
  wallet: null | {
    orgId: string;
    orgName: string;
    mode: 'credit' | 'prepaid';
    balance: number;
    available: number;
    creditLimit: number;
    dailyLimit: number;
    spentToday: number;
    welfareAmount: number;
  };
};
export type Tx = {
  id: string;
  type: string;
  status: string;
  amount: number;
  delta: number;
  direction: 'in' | 'out';
  counterparty: { kind: string; name: string; ref: string } | null;
  channel: string | null;
  note: string | null;
  createdAt: string;
};
export type Org = { id: string; name: string; code: string; moneyMode: 'credit' | 'prepaid'; creditLimit: number; dailyLimit: number; welfareAmount: number };
export type Employee = {
  id: string;
  userId: string;
  code: string | null;
  name: string;
  department: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  activated: boolean;
  lineLinked: boolean;
  balance: number;
  available: number;
};
export type Shop = { id: string; name: string; status: 'active' | 'inactive'; ownerName: string | null; ownerPhone: string | null; activated: boolean; payable: number };
export type Summary = {
  count: number;
  total: number;
  buyers: number;
  byShop: { id: string; name: string; count: number; total: number }[];
  byDay: { day: string; count: number; total: number }[];
  toDeduct: number;
  shopsPayable: number;
};
export type PayrollItem = { memberId: string; code: string | null; name: string; department: string | null; deduct: number };

// ---------- endpoints ----------
const dev = () => deviceId();
export const api = {
  // auth
  login: (phone: string, pin: string) =>
    raw<({ otpRequired: false } & Tokens) | ({ otpRequired: true; maskedPhone: string } & Otp)>('POST', '/auth/login', { phone, pin, deviceId: dev() }, false),
  loginVerify: (otpId: string, code: string) => raw<Tokens>('POST', '/auth/login/verify', { otpId, code, deviceId: dev() }, false),
  activateOtp: (phone: string) => raw<Otp>('POST', '/auth/activate/otp', { phone, deviceId: dev() }, false),
  activate: (otpId: string, code: string, pin: string) => raw<Tokens>('POST', '/auth/activate', { otpId, code, pin, deviceId: dev() }, false),
  lineLogin: (idToken: string) => raw<{ linked: false } | ({ linked: true } & Tokens)>('POST', '/auth/line/login', { idToken, deviceId: dev() }, false),
  lineLink: (idToken: string) => call<{ ok: true }>('POST', '/auth/line/link', { idToken }),
  logout: () => call<{ ok: true }>('POST', '/auth/logout'),
  me: () => call<Me>('GET', '/canteen/me'),

  // employee
  resolve: (qr: string) => call<{ merchantId: string; merchantName: string; amount: number | null; chargeId: string | null }>('POST', '/canteen/pay/resolve', { qr }),
  pay: (b: { merchantId: string; chargeId?: string | null; amount: number; pin: string; idempotencyKey: string; channel: 'app' | 'liff' }) =>
    call<Tx>('POST', '/canteen/pay', { ...b, chargeId: b.chargeId ?? undefined }),
  myTx: (cursor?: number | null) => call<{ items: Tx[]; nextCursor: number | null }>('GET', `/canteen/transactions${cursor ? `?cursor=${cursor}` : ''}`),

  // shop
  shop: () => call<{ id: string; name: string; orgName: string; staticQr: string; payable: number; today: { count: number; total: number } }>('GET', '/shop'),
  createCharge: (amount: number) => call<{ chargeId: string; amount: number; expiresAt: string; qr: string }>('POST', '/shop/charges', { amount }),
  charge: (id: string) => call<{ id: string; amount: number; status: 'open' | 'paid' | 'cancelled' | 'expired'; payer: string | null }>('GET', `/shop/charges/${id}`),
  cancelCharge: (id: string) => call<{ ok: true }>('POST', `/shop/charges/${id}/cancel`),
  badgePay: (b: { badge: string; amount: number; pin: string; idempotencyKey: string }) => call<Tx>('POST', '/shop/badge-pay', b),
  shopTx: (date?: string) => call<Tx[]>('GET', `/shop/transactions${date ? `?date=${date}` : ''}`),

  // hr
  org: () => call<Org>('GET', '/org'),
  updateOrg: (b: Partial<Omit<Org, 'id' | 'name' | 'code'>>) => call<{ ok: true }>('PATCH', '/org', b),
  employees: (q?: string) => call<Employee[]>('GET', `/org/employees${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  importEmployees: (employees: { code: string; name: string; department?: string | null; phone?: string | null }[]) =>
    call<{ created: number; updated: number; errors: { code: string; message: string }[] }>('POST', '/org/employees/import', { employees }),
  updateEmployee: (id: string, b: { status?: 'active' | 'inactive'; department?: string }) => call<{ ok: true }>('PATCH', `/org/employees/${id}`, b),
  badge: (id: string, rotate = false) => call<{ qr: string }>('POST', `/org/employees/${id}/badge`, { rotate }),
  badges: () => call<{ id: string; code: string | null; name: string; department: string | null; qr: string }[]>('GET', '/org/badges'),
  setEmployeePin:(id: string, pin: string) => call<{ ok: true }>('POST', `/org/employees/${id}/pin`, { pin }),
  topupEmployee: (id: string, amount: number, idempotencyKey: string, note?: string) =>
    call<{ id: string }>('POST', `/org/employees/${id}/topup`, { amount, idempotencyKey, note }),
  welfareRun: (cycle: string) => call<{ cycle: string; employees: number; amountEach: number; total: number }>('POST', '/org/welfare/run', { cycle }),
  welfareRuns: () => call<{ cycle: string; amount: number; employees: number; created_at: string }[]>('GET', '/org/welfare/runs'),
  payroll: () => call<{ asOf: string; items: PayrollItem[]; total: number }>('GET', '/org/payroll'),
  settlePayroll: (cycle: string, items: { memberId: string; amount: number }[]) => call<{ settled: number }>('POST', '/org/payroll/settle', { cycle, items }),
  shops: () => call<Shop[]>('GET', '/org/merchants'),
  createShop: (b: { name: string; ownerName: string; ownerPhone: string }) => call<{ id: string }>('POST', '/org/merchants', b),
  updateShop: (id: string, b: { name?: string; status?: 'active' | 'inactive' }) => call<{ ok: true }>('PATCH', `/org/merchants/${id}`, b),
  payoutShop: (id: string, amount: number, idempotencyKey: string, note?: string) =>
    call<{ id: string }>('POST', `/org/merchants/${id}/payout`, { amount, idempotencyKey, note }),
  summary: (from: string, to: string) => call<Summary>('GET', `/org/reports/summary?from=${from}&to=${to}`),
  reportTx: (from: string, to: string) =>
    call<{ id: string; type: string; amount: number; channel: string | null; created_at: string; employee: string | null; employee_code: string | null; shop: string | null }[]>(
      'GET',
      `/org/reports/transactions?from=${from}&to=${to}`
    ),
  addHr: (name: string, phone: string) => call<{ ok: true }>('POST', '/org/hr-staff', { name, phone }),
};

// ---------- user-facing errors (Thai) ----------
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
  const left = e.data.attemptsLeft as number | undefined;
  const map: Record<string, string> = {
    NETWORK: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต',
    LOGIN_FAILED: 'เบอร์โทรหรือ PIN ไม่ถูกต้อง',
    PIN_INVALID: left !== undefined ? `PIN ไม่ถูกต้อง เหลืออีก ${left} ครั้ง` : 'PIN ไม่ถูกต้อง',
    PIN_WEAK: 'PIN ง่ายเกินไป หลีกเลี่ยงเลขเรียงหรือเลขซ้ำ',
    LOCKED: 'ใส่ PIN ผิดหลายครั้ง ล็อก 15 นาที',
    NOT_ACTIVATED: 'บัญชียังไม่ได้เปิดใช้งาน',
    NOT_INVITED: 'เบอร์นี้ยังไม่ได้ถูกเพิ่มโดยฝ่ายบุคคล',
    ALREADY_ACTIVE: 'เปิดใช้งานแล้ว เข้าสู่ระบบได้เลย',
    OTP_INVALID: 'รหัส OTP ไม่ถูกต้อง',
    OTP_EXPIRED: 'รหัส OTP หมดอายุ ขอรหัสใหม่',
    OTP_TOO_MANY_ATTEMPTS: 'ใส่รหัสผิดหลายครั้ง ขอรหัสใหม่',
    RATE_LIMITED: 'ทำรายการถี่เกินไป รอสักครู่',
    ROLE_REQUIRED: 'บัญชีนี้ไม่มีสิทธิ์ใช้หน้านี้',
    INSUFFICIENT_FUNDS: 'ยอดเงินหรือวงเงินไม่พอ',
    DAILY_LIMIT: 'เกินวงเงินใช้จ่ายต่อวัน',
    QR_INVALID: 'QR นี้ไม่ใช่ QR ร้านในโรงอาหาร',
    CHARGE_CLOSED: 'QR นี้ถูกใช้ไปแล้ว',
    CHARGE_EXPIRED: 'QR หมดอายุ ให้ร้านสร้างใหม่',
    CHARGE_NOT_FOUND: 'ไม่พบรายการ',
    MERCHANT_NOT_FOUND: 'ไม่พบร้านค้า',
    BADGE_NOT_FOUND: 'ไม่พบบัตรพนักงาน หรือบัตรถูกยกเลิก',
    EMPLOYEE_INACTIVE: 'พนักงานถูกระงับการใช้งาน',
    WELFARE_DONE: 'รอบนี้เติมสวัสดิการไปแล้ว',
    WELFARE_ZERO: 'ยังไม่ได้ตั้งยอดสวัสดิการต่อคน',
    LINE_TAKEN: 'บัญชี LINE นี้ผูกกับพนักงานคนอื่นแล้ว',
    LINE_TOKEN_INVALID: 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ',
    VALIDATION: 'ข้อมูลไม่ถูกต้อง',
  };
  return map[e.code] ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

// ---------- money ----------
export const baht = (satang: number, sign = false) =>
  `${satang < 0 ? '-' : sign && satang > 0 ? '+' : ''}฿${(Math.abs(satang) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "45.5" → 4550 satang; null if invalid. */
export function toSatang(input: string): number | null {
  const s = input.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ''] = s.split('.');
  return Number(i) * 100 + Number(d.padEnd(2, '0'));
}

export const normalizePhone = (s: string) => s.replace(/\D/g, '').replace(/^66/, '0');
export const isThaiMobile = (s: string) => /^0[689]\d{8}$/.test(normalizePhone(s));
export const newKey = () => crypto.randomUUID();
/** Bangkok calendar date (YYYY-MM-DD). */
export const bkkDate = (d = new Date()) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
