import { Pressable, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { color, font } from "@/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "home", label: "หน้าหลัก", icon: "home" },
  { name: "activity", label: "รายการ", icon: "list" },
  { name: "profile", label: "โปรไฟล์", icon: "user" },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, emitter, navigateToTab }) => (
        <View
          accessibilityRole="tablist"
          style={{ flexDirection: "row", backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line, paddingBottom: Math.max(insets.bottom, 12) }}
        >
          {state.routes.map((route, i) => {
            const tab = TABS.find((t) => t.name === route.name);
            if (!tab) return null;
            const active = state.index === i;
            const c = active ? color.accent : color.muted;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
                onPress={() => {
                  const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!active && !e.defaultPrevented) navigateToTab(route.key);
                }}
                style={{ flex: 1, alignItems: "center", paddingTop: 10, gap: 4, minHeight: 56 }}
              >
                <Icon name={tab.icon} color={c} />
                <Text style={{ fontFamily: active ? font.semibold : font.medium, fontSize: 12, color: c }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
    </Tabs>
  );
}
