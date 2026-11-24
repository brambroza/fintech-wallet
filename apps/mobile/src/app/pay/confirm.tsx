import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PinPad } from "@/components/PinPad";
import { Card, T } from "@/components/ui";
import { ApiError, api, errorText } from "@/lib/api";
import { baht } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** Every payment needs the PIN (biometrics only unlock the app). */
export default function PayConfirm() {
  const { pay, setPay, loadMe } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!pay.target || !pay.amount || !pay.idempotencyKey) {
    router.replace("/home");
    return null;
  }

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.pay({ merchantId: pay.target!.merchantId, chargeId: pay.target!.chargeId, amount: pay.amount!, pin, idempotencyKey: pay.idempotencyKey! });
      setPay({ result: r, errorText: undefined });
      loadMe();
      router.replace("/pay/result");
    } catch (e) {
      if (e instanceof ApiError && (e.code === "PIN_INVALID" || e.code === "LOCKED")) {
        setError(errorText(e));
        setReset((n) => n + 1);
        return;
      }
      setPay({ result: undefined, errorText: errorText(e) });
      router.replace("/pay/result");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
      <View style={{ padding: 20 }}>
        <Card style={{ padding: 20, alignItems: "center", gap: 4 }}>
          <T v="caption">จ่ายให้</T>
          <T v="h1">{pay.target.merchantName}</T>
          <T v="display" style={{ marginTop: 4 }}>
            {baht(pay.amount)}
          </T>
        </Card>
      </View>
      <View style={{ flex: 1 }} />
      <T v="h2" style={{ textAlign: "center", marginBottom: 12 }}>
        ใส่ PIN เพื่อยืนยัน
      </T>
      <PinPad onComplete={submit} error={error} resetKey={reset} disabled={busy} />
      <Pressable accessibilityRole="button" onPress={() => router.replace("/home")} style={{ alignSelf: "center", padding: 14 }}>
        <T v="label" style={{ color: color.muted }}>
          ยกเลิก
        </T>
      </Pressable>
    </SafeAreaView>
  );
}
