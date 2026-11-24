import { useCallback, useState } from "react";
import { ActivityIndicator, SectionList, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { TxRow } from "@/components/TxRow";
import { Header, T } from "@/components/ui";
import { api, type Txn } from "@/lib/api";
import { thaiDay } from "@/lib/format";
import { color, radius } from "@/theme";

function group(items: Txn[]) {
  const map = new Map<string, Txn[]>();
  for (const t of items) {
    const d = thaiDay(t.createdAt);
    map.set(d, [...(map.get(d) ?? []), t]);
  }
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

export default function Activity() {
  const [items, setItems] = useState<Txn[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (from: number | null) => {
    setLoading(true);
    setError(false);
    try {
      const r = await api.transactions(from);
      setItems((prev) => (from ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(null);
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top"]}>
      <Header title="รายการ" back={false} />
      <SectionList
        sections={group(items)}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <T v="caption" style={{ fontWeight: "600", marginTop: 10, marginBottom: 6 }}>
            {section.title}
          </T>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={{
              backgroundColor: color.surface,
              borderColor: color.line,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderTopWidth: index === 0 ? 1 : 0,
              borderBottomWidth: 1,
              borderTopLeftRadius: index === 0 ? radius.lg : 0,
              borderTopRightRadius: index === 0 ? radius.lg : 0,
              borderBottomLeftRadius: index === section.data.length - 1 ? radius.lg : 0,
              borderBottomRightRadius: index === section.data.length - 1 ? radius.lg : 0,
              overflow: "hidden",
            }}
          >
            <TxRow t={item} />
          </View>
        )}
        onEndReached={() => cursor && !loading && load(cursor)}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? undefined : (
            <T v="body" style={{ color: color.muted, textAlign: "center", paddingTop: 48 }}>
              {error ? "โหลดรายการไม่ได้ ดึงลงเพื่อลองใหม่" : "ยังไม่มีรายการ"}
            </T>
          )
        }
        ListFooterComponent={loading ? <ActivityIndicator color={color.accent} style={{ padding: 16 }} /> : undefined}
        refreshing={false}
        onRefresh={() => load(null)}
      />
    </SafeAreaView>
  );
}
