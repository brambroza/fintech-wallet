import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { AmountPad } from "@/components/AmountPad";
import { Button, Header, Screen, T } from "@/components/ui";
import { baht, parseBaht } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

/** Shop's static QR: the employee types the amount. */
export default function PayAmount() {
  const { pay, setPay, me } = useStore();
  const [value, setValue] = useState("");
  if (!pay.target) {
    router.replace("/home");
    return null;
  }
  const amount = parseBaht(value || "0") ?? 0;
  const available = me?.wallet?.available ?? 0;
  const over = amount > available;

  return (
    <Screen
      footer={
        <Button
          title="ถัดไป"
          disabled={!amount || over}
          onPress={() => {
            setPay({ amount });
            router.push("/pay/confirm");
          }}
        />
      }
    >
      <Header title={`จ่ายให้ ${pay.target.merchantName}`} />
      <View style={{ flex: 1, justifyContent: "flex-end", gap: 12 }}>
        <AmountPad value={value} onChange={setValue} quick={[20, 50, 100]} sub={over ? "เกินยอดที่ใช้ได้" : `ใช้ได้ ${baht(available)}`} />
      </View>
      {over ? (
        <T v="caption" style={{ color: color.bad, textAlign: "center" }} accessibilityLiveRegion="polite">
          เกินยอดที่ใช้ได้
        </T>
      ) : null}
    </Screen>
  );
}
