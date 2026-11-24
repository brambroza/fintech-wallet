/** All amounts from the API are integer satang. */
export function baht(satang: number, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  const { sign = false, decimals = true } = opts;
  const abs = Math.abs(satang) / 100;
  const s = abs.toLocaleString("th-TH", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  const prefix = satang < 0 ? "-" : sign && satang > 0 ? "+" : "";
  return `${prefix}฿${s}`;
}

/** "1,500.5" typed on the keypad → 150050 satang. Returns null if invalid. */
export function parseBaht(input: string): number | null {
  const clean = input.replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [i, d = ""] = clean.split(".");
  return Number(i) * 100 + Number(d.padEnd(2, "0"));
}

/** Format the keypad buffer with thousands separators, keeping a trailing dot/decimals. */
export function displayAmount(input: string): string {
  if (!input) return "0";
  const [i, d] = input.split(".");
  const int = Number(i || "0").toLocaleString("th-TH");
  return d === undefined ? int : `${int}.${d}`;
}

export function thaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function thaiDay(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export const normalizePhone = (s: string) => s.replace(/\D/g, "").replace(/^66/, "0");
export const isThaiMobile = (s: string) => /^0[689]\d{8}$/.test(normalizePhone(s));
export const maskPhone = (p: string) => `${p.slice(0, 3)}-xxx-${p.slice(-4)}`;

export function initials(name: string): string {
  const t = name.trim();
  return t ? t.slice(0, 2) : "?";
}
