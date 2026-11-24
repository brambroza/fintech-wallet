import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button, Notice, Screen, StatusHero, T } from "@/components/ui";
import { api } from "@/lib/api";
import { color } from "@/theme";

/** Polls KYC status; moves on automatically when the vendor decides. */
export default function KycPending() {
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const k = await api.kyc();
        if (!alive) return;
        if (k.status === "approved") return router.replace("/link-funding");
        if (k.status === "rejected") return router.replace("/kyc/rejected");
      } catch {
        // keep polling
      }
      if (alive) setTimeout(tick, 5000);
    };
    tick();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Screen footer={<Button title="ไปหน้าหลัก" kind="secondary" onPress={() => router.replace("/home")} />}>
      <View style={{ flex: 1, paddingTop: 80, gap: 24 }}>
        <StatusHero icon="clock" tone="warn" title="กำลังตรวจสอบตัวตน">
          <T v="body" style={{ color: color.muted, textAlign: "center" }}>
            ปกติไม่เกิน 1 ชั่วโมง{"\n"}เปิดหน้านี้ค้างไว้ หรือกลับมาดูภายหลังได้
          </T>
        </StatusHero>
        <View style={{ paddingHorizontal: 24 }}>
          <Notice>ระหว่างนี้เข้าแอปได้ แต่ยังโอนและเติมเงินไม่ได้จนกว่าจะยืนยันตัวตนเสร็จ</Notice>
        </View>
      </View>
    </Screen>
  );
}
