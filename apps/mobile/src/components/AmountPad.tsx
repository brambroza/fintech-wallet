import { View } from "react-native";
import { Keypad } from "./PinPad";
import { Chip, T } from "./ui";
import { displayAmount } from "@/lib/format";

/** Controlled amount entry: buffer like "1500.5". Max 9 integer digits, 2 decimals. */
export function AmountPad({ value, onChange, sub, quick = [500, 1000, 2000] }: { value: string; onChange: (v: string) => void; sub?: string; quick?: number[] }) {
  const key = (k: string) => {
    if (k === "." && (value.includes(".") || !value)) return;
    const [i, d] = value.split(".");
    if (d !== undefined && d.length >= 2) return;
    if (d === undefined && k !== "." && i.length >= 9) return;
    if (value === "0" && k !== ".") return onChange(k);
    onChange(value + k);
  };
  const addQuick = (n: number) => {
    const cur = Number((value || "0").split(".")[0]);
    onChange(String(cur + n));
  };
  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <T v="display" style={{ fontSize: 44, lineHeight: 56 }} accessibilityLabel={`จำนวนเงิน ${displayAmount(value)} บาท`}>
          ฿{displayAmount(value)}
        </T>
        {sub ? (
          <T v="caption" style={{ fontSize: 14 }}>
            {sub}
          </T>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {quick.map((q) => (
            <Chip key={q} label={`+${q.toLocaleString("th-TH")}`} onPress={() => addQuick(q)} />
          ))}
        </View>
      </View>
      <Keypad onKey={key} onDelete={() => onChange(value.slice(0, -1))} extra={{ label: ".", onPress: () => key(".") }} />
    </View>
  );
}
