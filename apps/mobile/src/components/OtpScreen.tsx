import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputInstance } from "react-native";
import { Button, Header, Screen, T } from "./ui";
import { color, font } from "@/theme";

/** Shared OTP step. `devCode` is shown only when the sandbox API returns it. */
export function OtpScreen({
  title,
  maskedPhone,
  note,
  devCode,
  onSubmit,
  onResend,
}: {
  title: string;
  maskedPhone: string;
  note?: string;
  devCode?: string;
  onSubmit: (code: string) => Promise<string | null>;
  onResend: () => Promise<string | null>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(30);
  const input = useRef<TextInputInstance>(null);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError(await onSubmit(c));
    setBusy(false);
  };

  return (
    <Screen footer={<Button title="ยืนยัน" disabled={code.length !== 6} loading={busy} onPress={() => submit()} />}>
      <Header title={title} />
      <View style={{ paddingHorizontal: 20, gap: 20, paddingTop: 8 }}>
        <T v="body" style={{ color: color.muted }}>
          เราส่งรหัส 6 หลักไปที่ <T v="bodyStrong">{maskedPhone}</T>
          {note ? `\n${note}` : ""}
        </T>
        <Pressable onPress={() => input.current?.focus()} accessible={false} style={{ flexDirection: "row", gap: 8 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 56,
                borderRadius: 12,
                backgroundColor: color.surface,
                borderWidth: i === code.length ? 2 : 1,
                borderColor: error ? color.bad : i === code.length ? color.accent : color.field,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T v="h1" style={{ fontFamily: font.semibold, fontSize: 24 }}>
                {code[i] ?? ""}
              </T>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const c = t.replace(/\D/g, "").slice(0, 6);
            setCode(c);
            setError(null);
            if (c.length === 6) submit(c);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={6}
          accessibilityLabel="รหัส OTP 6 หลัก"
          style={{ position: "absolute", opacity: 0, height: 1, width: 1 }}
        />
        {error ? (
          <T v="caption" style={{ color: color.bad }} accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
        {devCode ? <T v="caption">Sandbox: รหัสคือ {devCode}</T> : null}
        {left > 0 ? (
          <T v="body" style={{ color: color.muted, fontSize: 15 }}>
            ขอรหัสใหม่ได้ใน <T v="bodyStrong">0:{String(left).padStart(2, "0")}</T>
          </T>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              const e = await onResend();
              setError(e);
              if (!e) {
                setLeft(30);
                setCode("");
              }
            }}
            style={{ paddingVertical: 10 }}
          >
            <T v="label" style={{ color: color.accent }}>
              ขอรหัสใหม่
            </T>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}
