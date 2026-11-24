import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Button, Card, Field, Header, IconBox, Notice, T } from "@/components/ui";
import { api, errorText, type Goal } from "@/lib/api";
import { baht, parseBaht } from "@/lib/format";
import { color, hit } from "@/theme";

function Bar({ pct, tone = color.accent }: { pct: number; tone?: string }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: color.neutralSoft, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: 8, borderRadius: 4, backgroundColor: tone }} />
    </View>
  );
}

export default function Save() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [spent, setSpent] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, i] = await Promise.all([api.goals(), api.insights()]);
      setGoals(g);
      setSpent(i.spent);
    } catch {
      // leave previous data
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    const t = parseBaht(target);
    if (!name.trim() || !t) return setError("ใส่ชื่อและยอดเป้าหมาย");
    setBusy(true);
    setError(null);
    try {
      await api.createGoal(name.trim(), t);
      setCreating(false);
      setName("");
      setTarget("");
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={["top"]}>
      <Header
        title="ออมเงิน"
        back={false}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="สร้างเป้าหมาย"
            onPress={() => setCreating(!creating)}
            style={{ width: hit, height: hit, borderRadius: hit / 2, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={creating ? "x" : "plus"} size={22} color={color.accent} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        {creating ? (
          <Card style={{ padding: 16, gap: 14 }}>
            <T v="h2">เป้าหมายใหม่</T>
            <Field label="ชื่อเป้าหมาย" placeholder="เช่น เที่ยวญี่ปุ่น" value={name} onChangeText={setName} maxLength={40} />
            <Field label="ยอดเป้าหมาย (บาท)" placeholder="40000" keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
            {error ? <Notice tone="bad">{error}</Notice> : null}
            <Button title="สร้างเป้าหมาย" loading={busy} onPress={create} />
          </Card>
        ) : null}

        <T v="label" style={{ color: color.muted }}>
          เป้าหมาย
        </T>
        {goals.length ? (
          goals.map((g) => {
            const pct = Math.round((g.saved / g.target) * 100);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/goal/[id]", params: { id: g.id, name: g.name, target: String(g.target), saved: String(g.saved) } })}
              >
                <Card style={{ padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconBox name="target" />
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong">{g.name}</T>
                      <T v="caption">
                        {baht(g.saved, { decimals: false })} / {baht(g.target, { decimals: false })}
                      </T>
                    </View>
                    <T v="bodyStrong" style={{ color: color.accent }}>
                      {pct}%
                    </T>
                  </View>
                  <Bar pct={pct} />
                </Card>
              </Pressable>
            );
          })
        ) : !creating ? (
          <Card style={{ padding: 20, alignItems: "center", gap: 10 }}>
            <T v="body" style={{ color: color.muted, textAlign: "center" }}>
              ยังไม่มีเป้าหมาย ตั้งเป้าแล้วแยกเงินเก็บไว้ได้เลย
            </T>
            <Button title="สร้างเป้าหมาย" kind="secondary" onPress={() => setCreating(true)} style={{ alignSelf: "stretch" }} />
          </Card>
        ) : null}

        <T v="label" style={{ color: color.muted, marginTop: 8 }}>
          ใช้จ่ายเดือนนี้
        </T>
        <Card style={{ padding: 16, gap: 4 }}>
          <T v="title">{spent === null ? "—" : baht(spent)}</T>
          <T v="caption">รวมโอนออกทุกช่องทางตั้งแต่วันที่ 1</T>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
