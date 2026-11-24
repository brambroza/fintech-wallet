import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Avatar, Card, Divider, IconBox, ListRow, Switch, T } from "@/components/ui";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import { session } from "@/lib/session";
import { useStore } from "@/lib/store";
import { color, radius } from "@/theme";

export default function Profile() {
  const { me, loadMe, setMe } = useStore();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bio, setBio] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMe();
    }, [loadMe]),
  );
  useEffect(() => {
    (async () => {
      setBioAvailable((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
      setBio(await session.biometricEnabled());
    })();
  }, []);

  const toggleBio = async (on: boolean) => {
    if (on) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "เปิดใช้ Face ID / ลายนิ้วมือ" });
      if (!r.success) return;
    }
    await session.setBiometric(on);
    setBio(on);
  };

  const logout = () =>
    Alert.alert("ออกจากระบบ", "ครั้งหน้าต้องเข้าสู่ระบบด้วยเบอร์โทรและ PIN", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          await api.logout().catch(() => {});
          await session.clear();
          setMe(null);
          router.replace("/welcome");
        },
      },
    ]);

  const kycOk = me?.kyc.status === "approved";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 20, paddingBottom: 8 }}>
          <Avatar text={initials(me?.displayName ?? "")} size={60} />
          <View style={{ flex: 1 }}>
            <T v="h1" style={{ fontSize: 18 }}>
              {me?.displayName ?? " "}
            </T>
            <T v="caption" style={{ fontSize: 14 }}>
              {me?.phone ?? " "}
            </T>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: kycOk ? color.okSoft : color.warnSoft,
            }}
          >
            <Icon name={kycOk ? "check" : "clock"} size={14} color={kycOk ? color.ok : color.warnInk} strokeWidth={2.4} />
            <T v="caption" style={{ color: kycOk ? color.ok : color.warnInk, fontWeight: "600" }}>
              {kycOk ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}
            </T>
          </View>
        </View>

        <Card>
          <ListRow left={<IconBox name="lock" />} title="เปลี่ยน PIN" onPress={() => router.push("/change-pin")} />
          {bioAvailable ? (
            <>
              <Divider />
              <ListRow left={<IconBox name="face" />} title="Face ID / ลายนิ้วมือ" right={<Switch value={bio} onChange={toggleBio} label="Face ID / ลายนิ้วมือ" />} />
            </>
          ) : null}
          {!kycOk ? (
            <>
              <Divider />
              <ListRow left={<IconBox name="shield" />} title="ยืนยันตัวตน" sub="จำเป็นสำหรับการโอนและเติมเงิน" onPress={() => router.push(me?.kyc.status === "pending" ? "/kyc/pending" : "/kyc")} />
            </>
          ) : null}
        </Card>

        <Card>
          <ListRow
            left={<IconBox name="phone" />}
            title="ติดต่อเจ้าหน้าที่"
            onPress={() => Linking.openURL(`tel:${Constants.expoConfig?.extra?.supportPhone ?? ""}`)}
          />
        </Card>

        <Card>
          <ListRow left={<Icon name="logout" color={color.bad} />} title="ออกจากระบบ" titleColor={color.bad} onPress={logout} chevron={false} />
        </Card>

        <T v="caption" style={{ textAlign: "center", marginTop: 8 }}>
          เวอร์ชัน {Constants.expoConfig?.version}
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}
