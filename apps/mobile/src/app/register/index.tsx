import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { Button, Field, Header, Progress, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { isThaiMobile, normalizePhone } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

export default function RegisterPhone() {
  const { register, setRegister, devOtp } = useStore();
  const [phone, setPhone] = useState(register.phone);
  const [name, setName] = useState(register.displayName);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = isThaiMobile(phone) && name.trim().length > 0 && agree;

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = normalizePhone(phone);
      const r = await api.registerOtp(p);
      devOtp.current = r.code;
      setRegister({ phone: p, displayName: name.trim(), otpId: r.otpId });
      router.push("/register/otp");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll footer={<Button title="ขอรหัส OTP" disabled={!valid} loading={busy} onPress={next} />}>
      <Header title="สมัครใช้งาน" />
      <Progress step={1} label="เบอร์โทรศัพท์" />
      <View style={{ padding: 20, gap: 18 }}>
        <Field label="ชื่อที่ใช้แสดง" placeholder="เช่น สมชาย" value={name} onChangeText={setName} maxLength={60} autoComplete="name" />
        <Field
          label="เบอร์โทรศัพท์"
          placeholder="08x-xxx-xxxx"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          maxLength={12}
          hint="ใช้เบอร์ที่ลงทะเบียนในชื่อของคุณ"
          error={error}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agree }}
          onPress={() => setAgree(!agree)}
          style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 4 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: agree ? color.accent : color.field,
              backgroundColor: agree ? color.accent : color.surface,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            {agree ? <Icon name="check" size={16} color="#FFFFFF" strokeWidth={2.6} /> : null}
          </View>
          <T v="body" style={{ flex: 1, fontSize: 15 }}>
            ฉันยอมรับ <T v="body" style={{ color: color.accent, fontSize: 15 }}>ข้อกำหนดการใช้งาน</T> และ{" "}
            <T v="body" style={{ color: color.accent, fontSize: 15 }}>นโยบายความเป็นส่วนตัว</T>
          </T>
        </Pressable>
      </View>
    </Screen>
  );
}
