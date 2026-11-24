import { Share, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, KV, Screen, StatusHero, T } from "@/components/ui";
import { baht, thaiDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

export default function Result() {
  const { send, setSend } = useStore();
  const r = send.result;
  const ok = r?.status === "completed";
  const pending = r?.status === "pending";
  const done = () => {
    setSend(null);
    router.replace("/home");
  };

  if (!ok && !pending) {
    const reason = r?.failureReason ? "ธนาคารปลายทางปฏิเสธรายการ" : send.errorText ?? "เกิดข้อผิดพลาด";
    return (
      <Screen
        footer={
          <>
            <Button title="แก้ไขแล้วลองใหม่" onPress={() => router.replace("/send/amount")} />
            <Button title="กลับหน้าหลัก" kind="secondary" onPress={done} />
          </>
        }
      >
        <View style={{ flex: 1, paddingTop: 96 }}>
          <StatusHero icon="x" tone="bad" title="โอนเงินไม่สำเร็จ">
            <T v="body" style={{ color: color.muted, textAlign: "center" }}>
              {reason}
              {"\n"}เงินของคุณ<T v="bodyStrong">ยังไม่ถูกตัด</T>
              {r ? " (คืนเข้าบัญชีแล้ว)" : ""}
            </T>
          </StatusHero>
        </View>
      </Screen>
    );
  }

  const share = () =>
    Share.share({
      message: `โอนเงิน ${baht(r!.amount)} ให้ ${r!.counterparty?.name ?? ""} สำเร็จ\n${thaiDateTime(r!.createdAt)}\nเลขอ้างอิง ${r!.id}`,
    });

  return (
    <Screen
      footer={
        <>
          <Button title="แชร์สลิป" kind="secondary" icon="out" onPress={share} />
          <Button title="เสร็จสิ้น" onPress={done} />
        </>
      }
    >
      <View style={{ flex: 1, paddingTop: 56, gap: 16 }}>
        <StatusHero icon={pending ? "clock" : "check"} tone={pending ? "warn" : "ok"} title={pending ? "กำลังดำเนินการ" : "โอนเงินสำเร็จ"}>
          <T v="display">{baht(r!.amount)}</T>
        </StatusHero>
        <Card style={{ marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 4 }}>
          <KV k="ไปยัง" v={r!.counterparty?.name ?? "-"} sub={r!.counterparty?.ref} />
          <KV k="วันที่" v={thaiDateTime(r!.createdAt)} />
          {r!.fee ? <KV k="ค่าธรรมเนียม" v={baht(r!.fee)} /> : null}
          <View style={{ paddingVertical: 12 }}>
            <T v="caption">เลขอ้างอิง</T>
            <T v="body" selectable style={{ fontSize: 13 }}>
              {r!.id}
            </T>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
