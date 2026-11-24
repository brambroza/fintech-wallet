import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { AmountPad } from "@/components/AmountPad";
import { Avatar, Button, Card, Field, Header, ListRow, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { baht, initials, parseBaht } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

export default function Amount() {
  const { send, setSend, me } = useStore();
  const [value, setValue] = useState(send.amount ? String(send.amount / 100) : "");
  const [note, setNote] = useState(send.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = parseBaht(value || "0") ?? 0;
  const over = me ? amount > me.balance : false;

  if (!send.target) {
    router.replace("/send/recipient");
    return null;
  }
  const t = send.target;
  const label = t.kind === "wallet" ? t.phone : t.kind === "promptpay" ? `พร้อมเพย์ ${t.id}` : `${t.bankCode} ${t.accountNo}`;

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      const quote = await api.quote(t, amount);
      // One idempotency key per confirmed review, so retries after a timeout can't double-send.
      setSend({ amount, note: note.trim() || undefined, quote, idempotencyKey: Crypto.randomUUID(), recipientName: quote.to.name });
      router.push("/send/review");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="ถัดไป" disabled={!amount || over} loading={busy} onPress={next} />}>
      <Header title="ระบุจำนวนเงิน" />
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <Card>
          <ListRow left={<Avatar text={initials(send.recipientName ?? "?")} />} title={send.recipientName ?? "ผู้รับ"} sub={label} />
        </Card>
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </View>
      <View style={{ flex: 1, justifyContent: "flex-end", gap: 12 }}>
        <AmountPad
          value={value}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          sub={me ? (over ? "ยอดเงินไม่พอ" : `คงเหลือ ${baht(me.balance)}`) : undefined}
        />
        <View style={{ paddingHorizontal: 20 }}>
          <Field placeholder="บันทึกช่วยจำ (ไม่บังคับ)" value={note} onChangeText={setNote} maxLength={100} />
        </View>
      </View>
      {over ? <T v="caption" style={{ color: color.bad, textAlign: "center" }} accessibilityLiveRegion="polite">ยอดเงินไม่พอ</T> : null}
    </Screen>
  );
}
