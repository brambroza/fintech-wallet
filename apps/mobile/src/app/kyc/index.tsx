import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Icon, type IconName } from "@/components/Icon";
import { Button, Header, Notice, Progress, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useStore } from "@/lib/store";
import { capture } from "@/lib/camera";
import { color, font, radius } from "@/theme";


function Method({ active, icon, label, onPress }: { active: boolean; icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        flex: 1,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color.accent : color.line,
        backgroundColor: active ? color.accentSoft : color.surface,
        borderRadius: radius.md,
        padding: 14,
        gap: 8,
      }}
    >
      <Icon name={icon} size={26} color={active ? color.accent : color.ink} />
      <T v="bodyStrong" style={{ fontSize: 15, color: active ? color.accent : color.ink }}>
        {label}
      </T>
    </Pressable>
  );
}

export default function KycId() {
  const { kycImages } = useStore();
  const [method, setMethod] = useState<"id_card" | "ndid">("id_card");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setError(null);
    if (method === "ndid") {
      setBusy(true);
      try {
        await api.submitKyc({ method: "ndid" });
        router.replace("/kyc/pending");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    const img = await capture(false);
    if (img === "denied") return setError("ต้องอนุญาตให้ใช้กล้องเพื่อถ่ายรูปบัตร (ตั้งค่า > Wallet > กล้อง)");
    if (!img) return;
    kycImages.idCard = img;
    router.push("/kyc/selfie");
  };

  return (
    <Screen scroll footer={<Button title={method === "ndid" ? "ยืนยันผ่าน NDID" : "ถ่ายรูปบัตร"} loading={busy} onPress={go} />}>
      <Header title="ยืนยันตัวตน" back={false} />
      <Progress step={3} label="ยืนยันตัวตน" />
      <View style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: "row", gap: 10 }} accessibilityRole="radiogroup">
          <Method active={method === "id_card"} icon="id" label="สแกนบัตรประชาชน" onPress={() => setMethod("id_card")} />
          <Method active={method === "ndid"} icon="bank" label="NDID ผ่านแอปธนาคาร" onPress={() => setMethod("ndid")} />
        </View>
        {method === "id_card" ? (
          <>
            <View style={{ height: 220, borderRadius: radius.xl, backgroundColor: color.dark, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 260, height: 164, borderWidth: 2, borderStyle: "dashed", borderColor: "#FFFFFF", borderRadius: 14, alignItems: "center", justifyContent: "center" }}>
                <T v="body" style={{ color: "#FFFFFF", fontSize: 15 }}>
                  วางบัตรให้อยู่ในกรอบ
                </T>
              </View>
            </View>
            <View style={{ gap: 4 }}>
              {["ใช้บัตรตัวจริง ไม่หมดอายุ", "แสงพอ ไม่มีแสงสะท้อนบนเลขบัตร", "ถัดไปจะถ่ายรูปใบหน้า"].map((t) => (
                <T key={t} v="body" style={{ color: color.muted, fontSize: 15 }}>
                  • {t}
                </T>
              ))}
            </View>
          </>
        ) : (
          <T v="body" style={{ color: color.muted, fontFamily: font.regular }}>
            ระบบจะส่งคำขอยืนยันตัวตนไปที่แอปธนาคารที่คุณใช้ เปิดแอปธนาคารแล้วกดยืนยันภายใน 60 นาที
          </T>
        )}
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </View>
    </Screen>
  );
}
