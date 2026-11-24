import { View } from "react-native";
import { router } from "expo-router";
import { Button, Card, KV, Screen, StatusHero, T } from "@/components/ui";
import { baht, thaiDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

export default function PayResult() {
  const { pay, setPay } = useStore();
  const r = pay.result;
  const done = () => {
    setPay(null);
    router.replace("/home");
  };

  if (!r) {
    return (
      <Screen
        footer={
          <>
            <Button title="สแกนใหม่" onPress={() => router.replace("/scan")} />
            <Button title="กลับหน้าหลัก" kind="secondary" onPress={done} />
          </>
        }
      >
        <View style={{ flex: 1, paddingTop: 96 }}>
          <StatusHero icon="x" tone="bad" title="จ่ายไม่สำเร็จ">
            <T v="body" style={{ color: color.muted, textAlign: "center" }}>
              {pay.errorText ?? "เกิดข้อผิดพลาด"}
              {"\n"}ยังไม่มีการตัดเงิน
            </T>
          </StatusHero>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title="เสร็จสิ้น" onPress={done} />}>
      <View style={{ flex: 1, paddingTop: 64, gap: 16 }}>
        <StatusHero icon="check" tone="ok" title="จ่ายแล้ว">
          <T v="display">{baht(r.amount)}</T>
        </StatusHero>
        <Card style={{ marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 4 }}>
          <KV k="ร้าน" v={r.counterparty?.name ?? pay.target?.merchantName ?? "-"} />
          <KV k="เวลา" v={thaiDateTime(r.createdAt)} />
          <View style={{ paddingVertical: 12 }}>
            <T v="caption">เลขอ้างอิง</T>
            <T v="body" selectable style={{ fontSize: 13 }}>
              {r.id}
            </T>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
