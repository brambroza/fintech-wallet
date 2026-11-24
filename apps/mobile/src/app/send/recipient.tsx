import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Avatar, Button, Card, Chip, Divider, Field, Header, ListRow, Screen, T } from "@/components/ui";
import { api, type Party, type Target } from "@/lib/api";
import { initials, normalizePhone } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color } from "@/theme";

type Kind = Target["kind"];
const KINDS: { k: Kind; label: string }[] = [
  { k: "wallet", label: "ในแอป" },
  { k: "promptpay", label: "พร้อมเพย์" },
  { k: "bank", label: "บัญชีธนาคาร" },
];
const BANKS = ["KBANK", "SCB", "BBL", "KTB", "BAY", "TTB", "GSB"];

export default function Recipient() {
  const { setSend } = useStore();
  const [kind, setKind] = useState<Kind>("wallet");
  const [id, setId] = useState("");
  const [bank, setBank] = useState("KBANK");
  const [recents, setRecents] = useState<Party[]>([]);

  useEffect(() => {
    setSend(null);
    api.recents().then(setRecents).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const digits = id.replace(/\D/g, "");
  const target: Target | null =
    kind === "wallet"
      ? /^0[689]\d{8}$/.test(normalizePhone(id))
        ? { kind, phone: normalizePhone(id) }
        : null
      : kind === "promptpay"
        ? /^(0\d{9}|\d{13})$/.test(digits)
          ? { kind, id: digits }
          : null
        : /^\d{10,12}$/.test(digits)
          ? { kind, bankCode: bank, accountNo: digits }
          : null;

  const pick = (t: Target, name?: string) => {
    setSend({ target: t, recipientName: name });
    router.push("/send/amount");
  };

  return (
    <Screen footer={<Button title="ถัดไป" disabled={!target} onPress={() => target && pick(target)} />}>
      <Header title="โอนเงิน" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
          {KINDS.map((x) => (
            <Chip key={x.k} label={x.label} active={kind === x.k} onPress={() => setKind(x.k)} />
          ))}
        </View>
        {kind === "bank" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {BANKS.map((b) => (
              <Chip key={b} label={b} active={bank === b} onPress={() => setBank(b)} />
            ))}
          </ScrollView>
        ) : null}
        <Field
          label={kind === "wallet" ? "เบอร์โทรผู้รับ (สมาชิก Wallet)" : kind === "promptpay" ? "เบอร์โทร หรือเลขบัตรประชาชน" : "เลขที่บัญชี"}
          placeholder={kind === "bank" ? "xxx-x-xxxxx-x" : "08x-xxx-xxxx"}
          keyboardType="number-pad"
          value={id}
          onChangeText={setId}
          maxLength={17}
          autoFocus
        />
        {recents.length ? (
          <>
            <T v="label" style={{ color: color.muted, marginTop: 4 }}>
              ล่าสุด
            </T>
            <Card>
              {recents.map((r, i) => (
                <View key={r.ref}>
                  {i ? <Divider /> : null}
                  <ListRow left={<Avatar text={initials(r.name)} />} title={r.name} sub={r.ref} onPress={r.target ? () => pick(r.target!, r.name) : undefined} />
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
