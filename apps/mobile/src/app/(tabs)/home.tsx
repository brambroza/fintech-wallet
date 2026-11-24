import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { TxRow } from "@/components/TxRow";
import { Avatar, Card, Divider, Notice, T } from "@/components/ui";
import { api, type Txn } from "@/lib/api";
import { baht, initials } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color, font, radius } from "@/theme";

export default function Home() {
  const { me, loadMe, setPay } = useStore();
  const [recent, setRecent] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await loadMe();
    api
      .transactions()
      .then((r) => setRecent(r.items.slice(0, 3)))
      .catch(() => setRecent([]));
  }, [loadMe]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const w = me?.wallet;
  const usedPct = w ? Math.min(100, (w.spentToday / w.dailyLimit) * 100) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
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
            <T v="h2">{me?.displayName ?? " "}</T>
            <T v="caption">{w?.orgName ?? " "}</T>
          </View>
        </View>

        {me && !w ? <Notice tone="bad">บัญชีนี้ยังไม่ได้เป็นพนักงานในระบบโรงอาหาร ติดต่อฝ่ายบุคคล</Notice> : null}

        <View style={{ backgroundColor: color.accent, borderRadius: radius.xl, padding: 20, gap: 4 }}>
          <T v="body" style={{ color: "#FFFFFF", fontSize: 14, opacity: 0.9 }}>
            ใช้ได้
          </T>
          <T v="display" style={{ color: "#FFFFFF", fontFamily: font.bold }}>
            {w ? baht(w.available) : " "}
          </T>
          <T v="body" style={{ color: "#FFFFFF", fontSize: 14, opacity: 0.9 }}>
            {!w
              ? " "
              : w.mode === "prepaid"
                ? "ยอดเงินคงเหลือ"
                : w.balance >= 0
                  ? `สวัสดิการคงเหลือ ${baht(w.balance)} · ใช้เกินได้ ${baht(w.creditLimit)}`
                  : `ใช้เกินสวัสดิการ ${baht(-w.balance)} · หักเงินเดือนรอบนี้`}
          </T>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!w}
          onPress={() => {
            setPay(null);
            router.push("/scan");
          }}
          style={({ pressed }) => ({
            height: 64,
            borderRadius: radius.lg,
            backgroundColor: pressed ? color.accentPressed : color.ink,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            opacity: w ? 1 : 0.4,
          })}
        >
          <Icon name="qr" size={28} color="#FFFFFF" />
          <T v="h1" style={{ color: "#FFFFFF" }}>
            สแกนจ่าย
          </T>
        </Pressable>

        {w ? (
          <Card style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T v="body" style={{ fontSize: 15 }}>
                ใช้วันนี้ {baht(w.spentToday)}
              </T>
              <T v="caption" style={{ fontSize: 14 }}>
                วงเงินต่อวัน {baht(w.dailyLimit)}
              </T>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: color.neutralSoft, overflow: "hidden" }}>
              <View style={{ width: `${usedPct}%`, height: 8, backgroundColor: color.accent }} />
            </View>
          </Card>
        ) : null}

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
