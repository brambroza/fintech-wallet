import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Button, Card, Screen, StatusHero, T } from "@/components/ui";
import { api } from "@/lib/api";
import { color } from "@/theme";

export default function KycRejected() {
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    api.kyc().then((k) => setReason(k.reason)).catch(() => {});
  }, []);

  return (
    <Screen
      footer={
        <>
          <Button title="ยืนยันตัวตนใหม่" onPress={() => router.replace("/kyc")} />
          <Button title="ติดต่อเจ้าหน้าที่" kind="secondary" onPress={() => Linking.openURL(`tel:${Constants.expoConfig?.extra?.supportPhone ?? ""}`)} />
        </>
      }
    >
      <View style={{ flex: 1, paddingTop: 80, gap: 24 }}>
        <StatusHero icon="x" tone="bad" title="ยืนยันตัวตนไม่ผ่าน">
          <T v="body" style={{ color: color.muted, textAlign: "center" }}>
            แก้ไขแล้วส่งใหม่ได้เลย ไม่ต้องสมัครใหม่
          </T>
        </StatusHero>
        <Card style={{ marginHorizontal: 24, padding: 16, gap: 6 }}>
          <T v="caption">เหตุผล</T>
          <T v="body">{reason ?? "เอกสารไม่ชัดเจน"}</T>
        </Card>
      </View>
    </Screen>
  );
}
