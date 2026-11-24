import { useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Button, Notice, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useStore } from "@/lib/store";
import { color, hit } from "@/theme";

/** Scan the shop's QR. Fixed-amount QR goes straight to PIN; the shop's static QR asks for the amount. */
export default function Scan() {
  const { setPay } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const onScanned = async (data: string) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const t = await api.resolve(data);
      setPay({ target: t, amount: t.amount ?? undefined, idempotencyKey: Crypto.randomUUID(), result: undefined, errorText: undefined });
      router.replace(t.amount ? "/pay/confirm" : "/pay/amount");
    } catch (e) {
      setError(errorText(e));
      setTimeout(() => (busy.current = false), 1500);
    }
  };

  const close = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="ปิด"
      onPress={() => router.back()}
      style={{ width: hit, height: hit, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="x" color="#FFFFFF" />
    </Pressable>
  );

  if (!permission) return <View style={{ flex: 1, backgroundColor: color.dark }} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: color.dark, padding: 20, gap: 16 }}>
        {close}
        <View style={{ flex: 1, justifyContent: "center", gap: 16 }}>
          <T v="h1" style={{ color: "#FFFFFF" }}>
            ขอใช้กล้องเพื่อสแกน QR
          </T>
          <T v="body" style={{ color: "#FFFFFF", opacity: 0.8 }}>
            ใช้กล้องเฉพาะตอนสแกนจ่ายเท่านั้น
          </T>
          {permission.canAskAgain ? (
            <Button title="อนุญาตใช้กล้อง" onPress={requestPermission} />
          ) : (
            <Button title="เปิดการตั้งค่า" onPress={() => Linking.openSettings()} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.dark }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(r) => onScanned(r.data)}
      />
      <SafeAreaView style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 16, justifyContent: "space-between" }} pointerEvents="box-none">
        {close}
        <View style={{ alignItems: "center" }} pointerEvents="none">
          <View style={{ width: 240, height: 240, borderWidth: 3, borderColor: "#FFFFFF", borderRadius: 24 }} />
          <T v="bodyStrong" style={{ color: "#FFFFFF", marginTop: 16 }}>
            สแกน QR ที่ร้าน
          </T>
        </View>
        <View>{error ? <Notice tone="bad">{error}</Notice> : <View style={{ height: 52 }} />}</View>
      </SafeAreaView>
    </View>
  );
}
