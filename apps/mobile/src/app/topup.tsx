import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { AmountPad } from "@/components/AmountPad";
import { Button, Header, Notice, Screen } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { baht, parseBaht } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Topup() {
  const { loadMe, me } = useStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(Crypto.randomUUID()).current;
  const amount = parseBaht(value || "0") ?? 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.topup(amount, key);
      await loadMe();
      router.replace("/home");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title={amount ? `เติมเงิน ${baht(amount)}` : "เติมเงิน"} disabled={!amount} loading={busy} onPress={submit} />}>
      <Header title="เติมเงิน" />
      <View style={{ flex: 1, justifyContent: "flex-end", gap: 16 }}>
        <View style={{ paddingHorizontal: 20 }}>
          {error ? <Notice tone="bad">{error}</Notice> : <Notice tone="info" icon="shield">Sandbox: จำลองการเติมเงิน ไม่มีการตัดเงินจริง</Notice>}
        </View>
        <AmountPad value={value} onChange={setValue} sub={me ? `คงเหลือ ${baht(me.balance)}` : undefined} />
      </View>
    </Screen>
  );
}
