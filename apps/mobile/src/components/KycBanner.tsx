import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { Me } from "@/lib/api";
import { color, radius } from "@/theme";
import { Icon } from "./Icon";
import { T } from "./ui";

/** Shown on Home/Pay while identity isn't verified — explains why money actions are disabled. */
export function KycBanner({ me }: { me: Me | null }) {
  if (!me || me.kyc.status === "approved") return null;
  const cfg = {
    none: { text: "ยืนยันตัวตนเพื่อเริ่มโอนและเติมเงิน", cta: "ยืนยันตัวตน", to: "/kyc", tone: [color.accentSoft, color.accentPressed] },
    pending: { text: "กำลังตรวจสอบตัวตน ยังโอนและเติมเงินไม่ได้", cta: "ดูสถานะ", to: "/kyc/pending", tone: [color.warnSoft, color.warnInk] },
    rejected: { text: "ยืนยันตัวตนไม่ผ่าน แก้ไขแล้วส่งใหม่ได้", cta: "ส่งใหม่", to: "/kyc/rejected", tone: [color.badSoft, color.bad] },
  }[me.kyc.status as "none" | "pending" | "rejected"];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(cfg.to as "/kyc")}
      style={{ backgroundColor: cfg.tone[0], borderRadius: radius.md, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <Icon name={me.kyc.status === "pending" ? "clock" : "shield"} size={22} color={cfg.tone[1]} />
      <View style={{ flex: 1 }}>
        <T v="body" style={{ color: cfg.tone[1], fontSize: 14, lineHeight: 21 }}>
          {cfg.text}
        </T>
      </View>
      <T v="label" style={{ color: cfg.tone[1] }}>
        {cfg.cta}
      </T>
    </Pressable>
  );
}
