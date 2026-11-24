import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { goHome } from "@/lib/nav";
import { PinPad } from "@/components/PinPad";
import { Button, Field, Header, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isThaiMobile, normalizePhone } from "@/lib/format";
import { session } from "@/lib/session";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** Login = phone → PIN. Unknown device gets an OTP step (login-otp). */
export default function Login() {
  const { setLogin, loadMe } = useStore();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "pin">("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);

  useEffect(() => {
    session.profile().then((p) => p.phone && setPhone(p.phone));
  }, []);

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const p = normalizePhone(phone);
      const r = await api.login(p, pin);
      if (r.otpRequired) {
        setLogin({ phone: p, otpId: r.otpId, maskedPhone: r.maskedPhone, devCode: r.code });
        router.push("/login-otp");
        return;
      }
      await session.saveTokens(r);
      const me = await loadMe();
      if (me) await session.saveProfile(me.phone ?? p, me.displayName);
      goHome();
    } catch (e) {
      setError(errorText(e));
      setReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (step === "pin") {
    return (
      <Screen>
        <Header title="ใส่ PIN" onBack={() => setStep("phone")} />
        <View style={{ flex: 1, alignItems: "center", paddingTop: 24, gap: 8 }}>
          <T v="body" style={{ color: color.muted }}>
            เข้าสู่ระบบด้วยเบอร์ {phone}
          </T>
        </View>
        <PinPad onComplete={submit} error={error} resetKey={reset} disabled={busy} />
        <View style={{ height: 24 }} />
      </Screen>
    );
  }

  const valid = isThaiMobile(phone);
  return (
    <Screen
      scroll
      footer={
        <>
          <Button title="ถัดไป" disabled={!valid} onPress={() => setStep("pin")} />
          <T v="body" style={{ textAlign: "center", color: color.muted }}>
            ใช้ครั้งแรก?{" "}
            <T v="bodyStrong" style={{ color: color.accent }} onPress={() => router.replace("/activate")} accessibilityRole="link">
              เปิดใช้งานบัญชี
            </T>
          </T>
        </>
      }
    >
      <Header title="เข้าสู่ระบบ" />
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Field
          label="เบอร์โทรศัพท์"
          placeholder="08x-xxx-xxxx"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          value={phone}
          onChangeText={setPhone}
          maxLength={12}
          autoFocus
          onSubmitEditing={() => valid && setStep("pin")}
        />
      </View>
    </Screen>
  );
}
