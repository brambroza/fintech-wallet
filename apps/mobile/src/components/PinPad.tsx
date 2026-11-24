import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { color, font } from "@/theme";
import { Icon } from "./Icon";

/** Numeric keypad. `extra` fills the bottom-left key (Face ID, or "." for amounts). */
export function Keypad({
  onKey,
  onDelete,
  extra,
}: {
  onKey: (k: string) => void;
  onDelete: () => void;
  extra?: { label: string; icon?: "face"; onPress: () => void } | null;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 28, rowGap: 4 }}>
      {keys.map((k) => (
        <Key key={k} label={k} onPress={() => onKey(k)}>
          <Text style={{ fontFamily: font.medium, fontSize: 26, color: color.ink }}>{k}</Text>
        </Key>
      ))}
      {extra ? (
        <Key label={extra.label} onPress={extra.onPress}>
          {extra.icon ? <Icon name={extra.icon} size={28} color={color.accent} /> : <Text style={{ fontFamily: font.medium, fontSize: 26, color: color.ink }}>{extra.label}</Text>}
        </Key>
      ) : (
        <View style={{ width: "33.33%", height: 60 }} />
      )}
      <Key label="0" onPress={() => onKey("0")}>
        <Text style={{ fontFamily: font.medium, fontSize: 26, color: color.ink }}>0</Text>
      </Key>
      <Key label="ลบ" onPress={onDelete}>
        <Icon name="del" size={26} />
      </Key>
    </View>
  );
}

function Key({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: "33.33%", height: 60, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: pressed ? color.neutralSoft : "transparent" })}
    >
      {children}
    </Pressable>
  );
}

export function PinDots({ length, filled, error }: { length: number; filled: number; error?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }} accessibilityLabel={`ใส่แล้ว ${filled} จาก ${length} หลัก`}>
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: i < filled ? (error ? color.bad : color.accent) : "transparent",
            borderWidth: i < filled ? 0 : 2,
            borderColor: error ? color.bad : color.field,
          }}
        />
      ))}
    </View>
  );
}

/** PIN entry: dots + keypad. Calls onComplete when 6 digits are entered; `resetKey` clears it. */
export function PinPad({
  onComplete,
  error,
  resetKey,
  biometric,
  disabled,
}: {
  onComplete: (pin: string) => void;
  error?: string | null;
  resetKey?: number;
  biometric?: () => void;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState("");
  useEffect(() => setPin(""), [resetKey]);
  const add = (k: string) => {
    if (disabled || pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 6) onComplete(next);
  };
  return (
    <View style={{ gap: 20 }}>
      <PinDots length={6} filled={pin.length} error={!!error} />
      <Text
        accessibilityLiveRegion="polite"
        style={{ minHeight: 22, textAlign: "center", fontFamily: font.regular, fontSize: 14, color: color.bad }}
      >
        {error ?? ""}
      </Text>
      <Keypad
        onKey={add}
        onDelete={() => setPin((p) => p.slice(0, -1))}
        extra={biometric ? { label: "ใช้ Face ID / ลายนิ้วมือ", icon: "face", onPress: biometric } : null}
      />
    </View>
  );
}
