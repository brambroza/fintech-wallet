import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Header, KV, Notice, Screen, T } from "@/components/ui";
import { baht } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Review() {
  const { send, me } = useStore();
  const q = send.quote;
  if (!q || !send.amount) {
    router.replace("/send/recipient");
    return null;
  }
  return (
    <Screen footer={<Button title="ยืนยันการโอน" icon="lock" onPress={() => router.push("/send/confirm")} />}>
      <Header title="ตรวจสอบก่อนโอน" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 16 }}>
        <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          <KV k="จาก" v={me?.displayName ?? "บัญชีของฉัน"} sub="Wallet" />
          <KV k="ไปยัง" v={q.to.name} sub={q.to.ref} />
          <KV k="จำนวนเงิน" v={baht(q.amount)} />
          <KV k="ค่าธรรมเนียม" v={q.fee ? baht(q.fee) : "ฟรี"} />
          {send.note ? <KV k="บันทึก" v={send.note} /> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 }}>
            <T v="bodyStrong" style={{ fontSize: 15 }}>
              ยอดรวม
            </T>
            <T v="title" style={{ fontSize: 22 }}>
              {baht(q.total)}
            </T>
          </View>
        </Card>
        <Notice>ตรวจชื่อผู้รับให้ถูกต้อง โอนแล้วยกเลิกไม่ได้</Notice>
      </ScrollView>
    </Screen>
  );
}
