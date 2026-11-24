import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { T } from "@/components/ui";
import { session } from "@/lib/session";
import { color } from "@/theme";

/** Splash: returning users (have a session on this device) go to PIN unlock, others to Welcome. */
export default function Splash() {
  useEffect(() => {
    (async () => {
      const rt = await session.getRefresh();
      router.replace(rt ? "/unlock" : "/welcome");
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: color.accent, alignItems: "center", justifyContent: "center", gap: 20 }}>
      <View style={{ width: 88, height: 88, borderRadius: 26, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <Icon name="wallet" size={48} color={color.accent} strokeWidth={2} />
      </View>
      <T v="title" style={{ color: "#FFFFFF", fontSize: 30 }}>
        Wallet
      </T>
      <T v="body" style={{ color: "#FFFFFF", opacity: 0.9 }}>
        โอน จ่าย ออม ในแอปเดียว
      </T>
    </View>
  );
}
