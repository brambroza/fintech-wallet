import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button, Field, Header, Progress, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isThaiMobile, normalizePhone } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** First use of an account HR added: phone → OTP → choose PIN. */
export default function ActivatePhone() {
  const { activate, setActivate, devOtp } = useStore();
  const [phone, setPhone] = useState(activate.phone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = normalizePhone(phone);
      const r = await api.activateOtp(p);
      devOtp.current = r.code;
      setActivate({ phone: p, otpId: r.otpId, code: undefined });
      router.push("/activate/otp");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll footer={<Button title="ขอรหัส OTP" disabled={!isThaiMobile(phone)} loading={busy} onPress={next} />}>
      <Header title="เปิดใช้งานบัญชี" />
      <Progress step={1} total={3} label="เบอร์โทรศัพท์" />
      <View style={{ padding: 20, gap: 16 }}>
        <T v="body" style={{ color: color.muted, fontSize: 15 }}>
          ใช้เบอร์ที่ให้ไว้กับฝ่ายบุคคล ถ้ายังไม่ได้ให้เบอร์ ติดต่อฝ่ายบุคคลก่อน
        </T>
        <Field
          label="เบอร์โทรศัพท์"
          placeholder="08x-xxx-xxxx"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          maxLength={12}
          error={error}
          autoFocus
        />
      </View>
    </Screen>
  );
}
