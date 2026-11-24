import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { Button, Header, Notice, Progress, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useStore } from "@/lib/store";
import { color, radius } from "@/theme";
import { capture } from "@/lib/camera";

export default function KycSelfie() {
  const { kycImages } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setError(null);
    if (!kycImages.idCard) return router.replace("/kyc");
    const img = await capture(true);
    if (img === "denied") return setError("ต้องอนุญาตให้ใช้กล้องเพื่อถ่ายรูปใบหน้า");
    if (!img) return;
    setBusy(true);
    try {
      await api.submitKyc({ method: "id_card", idCardImage: kycImages.idCard, selfieImage: img });
      kycImages.idCard = undefined;
      router.replace("/kyc/pending");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="ถ่ายรูปใบหน้า" loading={busy} onPress={go} />}>
      <Header title="ยืนยันตัวตน" />
      <Progress step={3} label="ถ่ายรูปใบหน้า" />
      <View style={{ flex: 1, padding: 20, alignItems: "center", gap: 18 }}>
        <View style={{ alignSelf: "stretch", height: 320, borderRadius: radius.xl, backgroundColor: color.dark, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 200, height: 260, borderRadius: 130, borderWidth: 3, borderStyle: "dashed", borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
            <Icon name="face" size={64} color="#FFFFFF" strokeWidth={1.4} />
          </View>
        </View>
        <T v="h2">ให้ใบหน้าอยู่ในกรอบ</T>
        <T v="body" style={{ color: color.muted, textAlign: "center", fontSize: 15 }}>
          ถอดแว่นกันแดดและหมวก{"\n"}มองกล้องตรง ๆ ในที่แสงสว่าง
        </T>
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </View>
    </Screen>
  );
}
