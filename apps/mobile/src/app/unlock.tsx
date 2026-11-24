import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { PinPad } from "@/components/PinPad";
import { Avatar, Screen, T } from "@/components/ui";
import { api, ApiError, errorText } from "@/lib/api";
import { initials } from "@/lib/format";
import { session } from "@/lib/session";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** Returning user on a trusted device: refresh the session, then PIN (server-checked) or biometrics. */
export default function Unlock() {
  const { loadMe } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);

  const enter = useCallback(async () => {
    const me = await loadMe();
    router.replace(me && me.kyc.status !== "approved" && me.kyc.status !== "pending" ? "/kyc" : "/home");
  }, [loadMe]);

  const expired = useCallback(async () => {
    await session.clear();
    router.replace("/login");
  }, []);

  const tryBiometric = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "ปลดล็อก Wallet", cancelLabel: "ใช้ PIN" });
    if (!r.success) return;
    setBusy(true);
    if (await api.refresh()) await enter();
    else await expired();
    setBusy(false);
  }, [enter, expired]);

  useEffect(() => {
    (async () => {
      setName((await session.profile()).name ?? "");
      const enabled = (await session.biometricEnabled()) && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      setBio(enabled);
      if (enabled) tryBiometric();
    })();
  }, [tryBiometric]);

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      if (!(await api.refresh())) return await expired();
      await api.verifyPin(pin);
      await enter();
    } catch (e) {
      setError(errorText(e));
      setReset((n) => n + 1);
      if (e instanceof ApiError && e.status === 401) await expired();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", paddingTop: 56, gap: 12 }}>
        <Avatar text={initials(name)} size={64} />
        <T v="h1">สวัสดี {name ? `คุณ${name}` : ""}</T>
        <T v="body" style={{ color: color.muted, marginBottom: 12 }}>
          ใส่ PIN 6 หลักเพื่อเข้าใช้งาน
        </T>
      </View>
      <PinPad onComplete={submit} error={error} resetKey={reset} disabled={busy} biometric={bio ? tryBiometric : undefined} />
      <Pressable accessibilityRole="button" onPress={expired} style={{ alignSelf: "center", padding: 14, marginBottom: 8 }}>
        <T v="label" style={{ color: color.accent }}>
          ลืม PIN? เข้าสู่ระบบใหม่
        </T>
      </Pressable>
    </Screen>
  );
}
