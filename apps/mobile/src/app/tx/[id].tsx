import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Card, Header, KV, Screen, StatusHero, T } from "@/components/ui";
import type { Txn } from "@/lib/api";
import { typeLabel } from "@/components/TxRow";
import { baht, thaiDateTime } from "@/lib/format";
import { color } from "@/theme";


export default function TxDetail() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const t = JSON.parse(data ?? "{}") as Txn;
  if (!t.id) return null;
  const tone = t.status === "failed" ? "bad" : t.status === "pending" ? "warn" : "ok";
  return (
    <Screen>
      <Header title="รายละเอียด" />
      <View style={{ paddingTop: 16, gap: 16 }}>
        <StatusHero icon={tone === "bad" ? "x" : tone === "warn" ? "clock" : "check"} tone={tone} title={baht(t.delta, { sign: true })}>
          <T v="body" style={{ color: color.muted }}>
            {typeLabel[t.type] ?? t.type}
            {t.status === "failed" ? " · ไม่สำเร็จ" : t.status === "pending" ? " · กำลังดำเนินการ" : ""}
          </T>
        </StatusHero>
        <Card style={{ marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 4 }}>
          {t.counterparty ? <KV k={t.direction === "in" ? "จาก" : "ร้าน"} v={t.counterparty.name} /> : null}
          <KV k="วันที่" v={thaiDateTime(t.createdAt)} />
          {t.note ? <KV k="บันทึก" v={t.note} /> : null}
          <View style={{ paddingVertical: 12 }}>
            <T v="caption">เลขอ้างอิง</T>
            <T v="body" selectable style={{ fontSize: 13 }}>
              {t.id}
            </T>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
