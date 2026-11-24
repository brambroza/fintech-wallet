import { View } from "react-native";
import { router } from "expo-router";
import { Button, Screen, T } from "@/components/ui";
import { color, radius } from "@/theme";

export default function Welcome() {
  return (
    <Screen
      footer={
        <>
          <Button title="สมัครใช้งาน" onPress={() => router.push("/register")} />
          <Button title="มีบัญชีแล้ว เข้าสู่ระบบ" kind="secondary" onPress={() => router.push("/login")} />
        </>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 32 }}>
        <View style={{ height: 280, borderRadius: 28, backgroundColor: color.accentSoft, overflow: "hidden" }} accessible={false}>
          <View style={{ position: "absolute", left: 40, top: 60, width: 230, height: 140, borderRadius: 18, backgroundColor: color.accent, transform: [{ rotate: "-8deg" }] }} />
          <View
            style={{
              position: "absolute",
              left: 76,
              top: 100,
              width: 230,
              height: 140,
              borderRadius: radius.lg + 2,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: color.line,
              padding: 18,
              justifyContent: "space-between",
            }}
          >
            <T v="caption">ยอดเงินคงเหลือ</T>
            <T v="title">฿12,450.00</T>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <T v="title" style={{ fontSize: 28, lineHeight: 38 }} accessibilityRole="header">
            จัดการเงินง่าย{"\n"}ในแอปเดียว
          </T>
          <T v="body" style={{ color: color.muted }}>
            โอนเงิน ตั้งเป้าออม และดูรายการได้ทันที ปลอดภัยด้วย PIN และ Face ID
          </T>
        </View>
      </View>
    </Screen>
  );
}
