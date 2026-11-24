import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { PinPad } from "@/components/PinPad";
import { Header, Screen, StatusHero, T, Button } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { color } from "@/theme";

type Step = "current" | "new" | "confirm" | "done";
const titles: Record<Exclude<Step, "done">, string> = {
  current: "ใส่ PIN ปัจจุบัน",
  new: "ตั้ง PIN ใหม่ 6 หลัก",
  confirm: "ยืนยัน PIN ใหม่",
};

export default function ChangePin() {
  const [step, setStep] = useState<Step>("current");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);

  const onPin = async (pin: string) => {
    setError(null);
    setReset((n) => n + 1);
    if (step === "current") {
      setCur(pin);
      return setStep("new");
    }
    if (step === "new") {
      setNext(pin);
      return setStep("confirm");
    }
    if (pin !== next) {
      setError("PIN ไม่ตรงกัน ตั้งใหม่อีกครั้ง");
      return setStep("new");
    }
    setBusy(true);
    try {
      await api.changePin(cur, next);
      setStep("done");
    } catch (e) {
      setError(errorText(e));
      setStep("current");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <Screen footer={<Button title="เสร็จสิ้น" onPress={() => router.back()} />}>
        <View style={{ flex: 1, paddingTop: 96 }}>
          <StatusHero icon="check" tone="ok" title="เปลี่ยน PIN แล้ว" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="เปลี่ยน PIN" />
      <View style={{ flex: 1, alignItems: "center", paddingTop: 28 }}>
        <T v="h1">{titles[step]}</T>
        {step !== "current" ? (
          <T v="body" style={{ color: color.muted, marginTop: 6 }}>
            หลีกเลี่ยงเลขเรียงหรือเลขซ้ำ
          </T>
        ) : null}
      </View>
      <PinPad onComplete={onPin} error={error} resetKey={reset} disabled={busy} />
      <View style={{ height: 24 }} />
    </Screen>
  );
}
