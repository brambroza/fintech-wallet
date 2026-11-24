import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Icon, type IconName } from "@/components/Icon";
import { KycBanner } from "@/components/KycBanner";
import { TxRow } from "@/components/TxRow";
import { Avatar, Card, Divider, IconBox, T } from "@/components/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Txn } from "@/lib/api";
import { baht, initials } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color, font, radius } from "@/theme";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
}

function Action({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={{ flex: 1, alignItems: "center", gap: 8, opacity: disabled ? 0.45 : 1 }}
    >
      <IconBox name={icon} size={52} />
      <T v="label" style={{ fontSize: 13 }}>
        {label}
      </T>
    </Pressable>
  );
}

export default function Home() {
  const { me, loadMe } = useStore();
  const [recent, setRecent] = useState<Txn[]>([]);
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await loadMe();
    try {
      setRecent((await api.transactions({ limit: 3 })).items);
    } catch {
      setRecent([]);
    }
  }, [loadMe]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canMove = me?.kyc.status === "approved";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 }}>
          <Avatar text={initials(me?.displayName ?? "")} />
          <View style={{ flex: 1 }}>
            <T v="caption">{greeting()}</T>
            <T v="h2">{me?.displayName ?? " "}</T>
          </View>
        </View>

        <KycBanner me={me} />

        <View style={{ backgroundColor: color.accent, borderRadius: radius.xl, padding: 20, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T v="body" style={{ color: "#FFFFFF", fontSize: 14, opacity: 0.9 }}>
              ยอดเงินคงเหลือ
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel={hidden ? "แสดงยอดเงิน" : "ซ่อนยอดเงิน"} onPress={() => setHidden(!hidden)} hitSlop={12}>
              <Icon name={hidden ? "eyeOff" : "eye"} size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <T v="display" style={{ color: "#FFFFFF", fontFamily: font.bold }}>
            {me ? (hidden ? "฿ ••••••" : baht(me.balance)) : " "}
          </T>
          <T v="body" style={{ color: "#FFFFFF", fontSize: 14, opacity: 0.9 }}>
            {me ? `Wallet · ${me.phone.slice(-4).padStart(8, "•")}` : " "}
          </T>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Action icon="pay" label="โอนเงิน" disabled={!canMove} onPress={() => router.push("/send/recipient")} />
          <Action icon="plus" label="เติมเงิน" disabled={!canMove} onPress={() => router.push("/topup")} />
          <Action icon="target" label="ออมเงิน" onPress={() => router.navigate("/save")} />
          <Action icon="list" label="รายการ" onPress={() => router.navigate("/activity")} />
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T v="h2">รายการล่าสุด</T>
            <Pressable accessibilityRole="link" onPress={() => router.navigate("/activity")} hitSlop={12}>
              <T v="label" style={{ color: color.accent }}>
                ดูทั้งหมด
              </T>
            </Pressable>
          </View>
          <Card>
            {recent.length ? (
              recent.map((t, i) => (
                <View key={t.id}>
                  {i ? <Divider /> : null}
                  <TxRow t={t} />
                </View>
              ))
            ) : (
              <T v="body" style={{ color: color.muted, padding: 16, textAlign: "center" }}>
                ยังไม่มีรายการ
              </T>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
