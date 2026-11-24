import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KycBanner } from "@/components/KycBanner";
import { Avatar, Header, IconBox, T } from "@/components/ui";
import type { IconName } from "@/components/Icon";
import { api, type Party } from "@/lib/api";
import { initials } from "@/lib/format";
import { useStore } from "@/lib/store";
import { color, radius } from "@/theme";

function Tile({ icon, label, sub, onPress, disabled }: { icon: IconName; label: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={{ flex: 1, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: 16, gap: 10, opacity: disabled ? 0.45 : 1 }}
    >
      <IconBox name={icon} size={44} />
      <View>
        <T v="bodyStrong">{label}</T>
        <T v="caption">{sub}</T>
      </View>
    </Pressable>
  );
}

export default function Pay() {
  const { me, setSend } = useStore();
  const [recents, setRecents] = useState<Party[]>([]);
  useFocusEffect(
    useCallback(() => {
      api.recents().then(setRecents).catch(() => setRecents([]));
    }, []),
  );
  const canMove = me?.kyc.status === "approved";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top"]}>
      <Header title="จ่าย / โอน" back={false} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 22 }}>
        <KycBanner me={me} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Tile icon="pay" label="โอนเงิน" sub="ในแอป พร้อมเพย์ ธนาคาร" disabled={!canMove} onPress={() => router.push("/send/recipient")} />
          <Tile icon="plus" label="เติมเงิน" sub="เข้ากระเป๋า" disabled={!canMove} onPress={() => router.push("/topup")} />
        </View>
        {recents.length ? (
          <View style={{ gap: 12 }}>
            <T v="h2">ผู้รับล่าสุด</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              {recents.map((r) => (
                <Pressable
                  key={r.ref}
                  accessibilityRole="button"
                  accessibilityLabel={`โอนให้ ${r.name}`}
                  disabled={!canMove || !r.target}
                  onPress={() => {
                    setSend(null);
                    setSend({ target: r.target, recipientName: r.name });
                    router.push("/send/amount");
                  }}
                  style={{ alignItems: "center", gap: 6, width: 64 }}
                >
                  <Avatar text={initials(r.name)} size={52} />
                  <T v="caption" numberOfLines={1} style={{ color: color.ink }}>
                    {r.name}
                  </T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
