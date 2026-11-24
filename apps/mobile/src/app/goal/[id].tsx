import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AmountPad } from "@/components/AmountPad";
import { Button, Chip, Header, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { baht, parseBaht } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function GoalMove() {
  const p = useLocalSearchParams<{ id: string; name: string; target: string; saved: string }>();
  const { me, loadMe } = useStore();
  const [dir, setDir] = useState<"deposit" | "withdraw">("deposit");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = parseBaht(value || "0") ?? 0;
  const saved = Number(p.saved);
  const max = dir === "deposit" ? (me?.balance ?? 0) : saved;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.moveGoal(p.id, amount, dir);
      await loadMe();
      router.back();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title={dir === "deposit" ? "ย้ายเข้าเป้าออม" : "ถอนกลับเข้ากระเป๋า"} disabled={!amount || amount > max} loading={busy} onPress={submit} />}>
      <Header title={p.name} />
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <T v="body">
          เก็บแล้ว {baht(saved)} จาก {baht(Number(p.target))}
        </T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="ฝากเข้า" active={dir === "deposit"} onPress={() => setDir("deposit")} />
          <Chip label="ถอนออก" active={dir === "withdraw"} onPress={() => setDir("withdraw")} />
        </View>
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </View>
      <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 8 }}>
        <AmountPad value={value} onChange={setValue} sub={`${dir === "deposit" ? "ในกระเป๋า" : "ในเป้าออม"} ${baht(max)}`} />
      </View>
    </Screen>
  );
}
