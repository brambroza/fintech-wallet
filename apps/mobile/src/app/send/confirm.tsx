import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { PinPad } from "@/components/PinPad";
import { T } from "@/components/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, api, errorText } from "@/lib/api";
import { baht } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** PIN is always required to send money (biometrics alone are not enough for payment auth). */
export default function Confirm() {
  const { send, setSend, loadMe } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!send.quote || !send.target || !send.amount || !send.idempotencyKey) {
    router.replace("/send/recipient");
    return null;
  }

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.transfer({ to: send.target!, amount: send.amount!, pin, note: send.note, idempotencyKey: send.idempotencyKey! });
      setSend({ result: r, errorText: undefined });
      loadMe();
      router.dismissAll();
      router.replace("/send/result");
    } catch (e) {
      if (e instanceof ApiError && (e.code === "PIN_INVALID" || e.code === "LOCKED")) {
        setError(errorText(e));
        setReset((n) => n + 1);
        return;
      }
      setSend({ result: undefined, errorText: errorText(e) });
      router.dismissAll();
      router.replace("/send/result");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }} edges={["bottom"]}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: color.field, alignSelf: "center", marginTop: 12 }} />
      <View style={{ alignItems: "center", gap: 8, paddingTop: 28, paddingHorizontal: 20 }}>
        <T v="h1">ใส่ PIN เพื่อยืนยัน</T>
        <T v="body" style={{ color: color.muted, fontSize: 15, textAlign: "center" }}>
          โอน {baht(send.quote.total)} ให้ {send.quote.to.name}
        </T>
      </View>
      <View style={{ flex: 1 }} />
      <PinPad onComplete={submit} error={error} resetKey={reset} disabled={busy} />
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ alignSelf: "center", padding: 14 }}>
        <T v="label" style={{ color: color.muted }}>
          ยกเลิก
        </T>
      </Pressable>
    </SafeAreaView>
  );
}
