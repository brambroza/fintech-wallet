import { View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Divider, Header, IconBox, ListRow, Notice, Progress, Screen, T } from "@/components/ui";
import { color } from "@/theme";

/**
 * Funding sources. In the sandbox every option leads to the simulated top-up; in production
 * each opens the partner bank's direct-debit / card tokenisation flow.
 */
export default function LinkFunding() {
  const go = () => router.replace("/topup");
  return (
    <Screen scroll footer={<Button title="ข้ามไปก่อน" kind="secondary" onPress={() => router.replace("/home")} />}>
      <Header title="เชื่อมบัญชีเติมเงิน" back={false} />
      <Progress step={4} label="แหล่งเงิน" />
      <View style={{ padding: 20, gap: 12 }}>
        <T v="body" style={{ color: color.muted, fontSize: 15 }}>
          เลือกช่องทางเติมเงินเข้าแอป ทำทีหลังได้
        </T>
        <Card>
          <ListRow left={<IconBox name="bank" />} title="บัญชีธนาคาร" sub="ตัดเงินอัตโนมัติ" onPress={go} />
          <Divider />
          <ListRow left={<IconBox name="card" />} title="บัตรเดบิต" sub="Visa / Mastercard" onPress={go} />
          <Divider />
          <ListRow left={<IconBox name="wallet" />} title="e-Wallet" sub="TrueMoney และอื่น ๆ" onPress={go} />
        </Card>
        <Notice tone="info" icon="shield">
          Sandbox: ทุกช่องทางจะจำลองการเติมเงิน ไม่มีการตัดเงินจริง
        </Notice>
      </View>
    </Screen>
  );
}
