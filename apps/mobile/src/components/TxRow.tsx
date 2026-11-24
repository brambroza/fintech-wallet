import { router } from "expo-router";
import type { Txn } from "@/lib/api";
import { baht, time } from "@/lib/format";
import { color, font } from "@/theme";
import { T, IconBox, ListRow } from "./ui";
import type { IconName } from "./Icon";

export const typeLabel: Record<string, string> = {
  purchase: "ซื้ออาหาร",
  welfare: "สวัสดิการ",
  payroll_settle: "หักเงินเดือนแล้ว",
  topup: "เติมเงิน",
  refund: "คืนเงิน",
  offboard: "ปิดบัญชี (ลาออก)",
};

export function TxRow({ t, dateFn = time }: { t: Txn; dateFn?: (iso: string) => string }) {
  const incoming = t.delta > 0;
  const failed = t.status === "failed";
  const icon: IconName = incoming ? "in" : "out";
  const name = t.counterparty?.name ?? typeLabel[t.type] ?? t.type;
  const statusText = failed ? " · ไม่สำเร็จ" : t.status === "pending" ? " · กำลังดำเนินการ" : "";
  return (
    <ListRow
      left={<IconBox name={icon} fg={incoming ? color.ok : color.muted} bg={incoming ? color.okSoft : color.neutralSoft} />}
      title={name}
      sub={`${typeLabel[t.type] ?? t.type} · ${dateFn(t.createdAt)}${statusText}`}
      right={
        <T
          v="bodyStrong"
          style={{ color: failed ? color.faint : incoming ? color.ok : color.ink, textDecorationLine: failed ? "line-through" : "none", fontFamily: font.semibold }}
        >
          {baht(t.delta, { sign: true })}
        </T>
      }
      onPress={() => router.push({ pathname: "/tx/[id]", params: { id: t.id, data: JSON.stringify(t) } })}
      chevron={false}
    />
  );
}
