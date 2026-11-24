import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { PinPad } from "@/components/PinPad";
import { Card, Header, IconBox, ListRow, Progress, Screen, Switch, T } from "@/components/ui";
import { ApiError, api, errorText } from "@/lib/api";
import { session } from "@/lib/session";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** Set PIN (enter twice), then create the account. */
export default function RegisterPin() {
  const { register, setRegister, loadMe } = useStore();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bio, setBio] = useState(true);

  useEffect(() => {
    (async () => setBioAvailable((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())))();
  }, []);

  const onPin = async (pin: string) => {
    setError(null);
    if (!first) {
      setFirst(pin);
      setReset((n) => n + 1);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError("PIN ไม่ตรงกัน ลองตั้งใหม่");
      setReset((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const t = await api.register({ otpId: register.otpId!, code: register.code!, pin, displayName: register.displayName });
      await session.saveTokens(t);
      await session.saveProfile(register.phone, register.displayName);
      await session.setBiometric(bioAvailable && bio);
      await loadMe();
      setRegister({ otpId: undefined, code: undefined });
      router.replace("/kyc");
    } catch (e) {
      setFirst(null);
      setReset((n) => n + 1);
      setError(errorText(e));
      // OTP problems mean the user must go back a step.
      if (e instanceof ApiError && e.code.startsWith("OTP_")) setTimeout(() => router.replace("/register/otp"), 1200);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="ตั้ง PIN" />
      <Progress step={2} label="ความปลอดภัย" />
      <View style={{ flex: 1, alignItems: "center", paddingTop: 28, gap: 6 }}>
        <T v="h1">{first ? "ยืนยัน PIN อีกครั้ง" : "ตั้ง PIN 6 หลัก"}</T>
        <T v="body" style={{ color: color.muted, textAlign: "center", paddingHorizontal: 24 }}>
          ใช้ปลดล็อกแอปและยืนยันทุกการโอน{"\n"}หลีกเลี่ยงเลขเรียงหรือเลขซ้ำ
        </T>
      </View>
      {bioAvailable ? (
        <Card style={{ marginHorizontal: 20, marginBottom: 8 }}>
          <ListRow left={<IconBox name="face" />} title="เปิดใช้ Face ID / ลายนิ้วมือ" right={<Switch value={bio} onChange={setBio} label="เปิดใช้ Face ID / ลายนิ้วมือ" />} />
        </Card>
      ) : null}
      <PinPad onComplete={onPin} error={error} resetKey={reset} disabled={busy} />
      <View style={{ height: 16 }} />
    </Screen>
  );
}
