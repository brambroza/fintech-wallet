import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { color, font, hit, radius, space } from "@/theme";
import { Icon, type IconName } from "./Icon";

// ---------- Text ----------
type Variant = "display" | "title" | "h1" | "h2" | "body" | "bodyStrong" | "label" | "caption";
const textStyles: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: 34, lineHeight: 46, color: color.ink },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 34, color: color.ink },
  h1: { fontFamily: font.semibold, fontSize: 20, lineHeight: 30, color: color.ink },
  h2: { fontFamily: font.semibold, fontSize: 17, lineHeight: 26, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 25, color: color.ink },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 25, color: color.ink },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: color.ink },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 20, color: color.muted },
};

export function T({ v = "body", style, ...p }: TextProps & { v?: Variant }) {
  return <Text {...p} style={[textStyles[v], style]} />;
}

// ---------- Layout ----------
export function Screen({
  children,
  scroll,
  footer,
  bg = color.bg,
  edges = ["top", "bottom"],
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  bg?: string;
  edges?: ("top" | "bottom")[];
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Header({ title, back = true, right, onBack }: { title?: string; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={s.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ย้อนกลับ"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/home")))}
          style={s.backBtn}
          hitSlop={8}
        >
          <Icon name="back" />
        </Pressable>
      ) : null}
      <T v="h1" style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </T>
      {right}
    </View>
  );
}

// ---------- Controls ----------
export function Button({
  title,
  onPress,
  kind = "primary",
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: "primary" | "secondary" | "danger-text";
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const fg = kind === "primary" ? "#FFFFFF" : kind === "secondary" ? color.accent : color.bad;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        kind === "primary" && { backgroundColor: pressed ? color.accentPressed : color.accent },
        kind === "secondary" && { backgroundColor: color.accentSoft },
        kind === "danger-text" && { backgroundColor: "transparent" },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export const Field = forwardRef<TextInputInstance, TextInputProps & { label?: string; hint?: string; error?: string | null; left?: ReactNode }>(
  function Field({ label, hint, error, left, style, ...p }, ref) {
    return (
      <View style={{ gap: 6 }}>
        {label ? <T v="label">{label}</T> : null}
        <View style={[s.input, error ? { borderColor: color.bad } : null]}>
          {left}
          <TextInput
            ref={ref}
            placeholderTextColor={color.faint}
            accessibilityLabel={label ?? p.placeholder}
            style={[{ flex: 1, fontFamily: font.regular, fontSize: 16, color: color.ink, paddingVertical: 0 }, style]}
            {...p}
          />
        </View>
        {error ? (
          <T v="caption" style={{ color: color.bad }} accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : hint ? (
          <T v="caption">{hint}</T>
        ) : null}
      </View>
    );
  },
);

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[s.chip, active ? { backgroundColor: color.accent, borderColor: color.accent } : null]}
    >
      <Text style={{ fontFamily: font.medium, fontSize: 14, color: active ? "#FFFFFF" : color.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[s.switch, { backgroundColor: value ? color.accent : color.field }]}
    >
      <View style={[s.knob, value ? { right: 3 } : { left: 3 }]} />
    </Pressable>
  );
}

// ---------- Surfaces ----------
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const Divider = () => <View style={{ height: 1, backgroundColor: color.line, marginHorizontal: space.lg }} />;

export function IconBox({ name, fg = color.accent, bg = color.accentSoft, size = 40 }: { name: IconName; fg?: string; bg?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={size * 0.55} color={fg} />
    </View>
  );
}

export function Avatar({ text, size = 44 }: { text: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: font.semibold, fontSize: size * 0.36, color: color.accent }}>{text}</Text>
    </View>
  );
}

export function ListRow({
  left,
  title,
  sub,
  right,
  onPress,
  chevron = !!onPress,
  titleColor,
}: {
  left?: ReactNode;
  title: string;
  sub?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  titleColor?: string;
}) {
  const body = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="body" style={{ fontFamily: font.medium, color: titleColor ?? color.ink }} numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T v="caption" numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chev" size={20} color={color.faint} /> : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.bg }]}>
      {body}
    </Pressable>
  ) : (
    <View style={s.row}>{body}</View>
  );
}

export function Progress({ step, total = 4, label }: { step: number; total?: number; label: string }) {
  return (
    <View style={{ paddingHorizontal: space.xl, gap: 8 }} accessibilityLabel={`ขั้นที่ ${step} จาก ${total}`}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? color.accent : color.line }} />
        ))}
      </View>
      <T v="caption">
        ขั้นที่ {step} จาก {total} · {label}
      </T>
    </View>
  );
}

export function Notice({ tone = "warn", icon = "alert", children }: { tone?: "warn" | "info" | "bad"; icon?: IconName; children: ReactNode }) {
  const t = {
    warn: { bg: color.warnSoft, fg: color.warnInk },
    info: { bg: color.accentSoft, fg: color.accentPressed },
    bad: { bg: color.badSoft, fg: color.bad },
  }[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.md, padding: 14, flexDirection: "row", gap: 12 }}>
      <Icon name={icon} size={22} color={t.fg} />
      <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 22, color: t.fg }}>{children}</Text>
    </View>
  );
}

export function StatusHero({ icon, tone, title, children }: { icon: IconName; tone: "ok" | "bad" | "warn"; title: string; children?: ReactNode }) {
  const t = { ok: [color.ok, color.okSoft], bad: [color.bad, color.badSoft], warn: [color.warn, color.warnSoft] }[tone];
  return (
    <View style={{ alignItems: "center", gap: 12, paddingHorizontal: space.xxl }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t[1], alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={40} color={t[0]} strokeWidth={2} />
      </View>
      <T v="title" style={{ textAlign: "center", marginTop: 8 }} accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

export function KV({ k, v, sub, strong }: { k: string; v: string; sub?: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <T v="body" style={{ color: color.muted, fontSize: 15 }}>
        {k}
      </T>
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
        <T v={strong ? "h1" : "body"} style={{ fontFamily: strong ? font.bold : font.medium, textAlign: "right", fontSize: strong ? 20 : 15 }}>
          {v}
        </T>
        {sub ? <T v="caption">{sub}</T> : null}
      </View>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

export const s = StyleSheet.create({
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.md },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, minHeight: 64 },
  backBtn: { width: hit, height: hit, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  btn: { height: 52, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnText: { fontFamily: font.semibold, fontSize: 16 },
  input: { height: 52, borderWidth: 1, borderColor: color.field, borderRadius: radius.sm, paddingHorizontal: 14, backgroundColor: color.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface, justifyContent: "center", minWidth: hit, alignItems: "center" },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 56 },
  switch: { width: 48, height: 28, borderRadius: 14, justifyContent: "center" },
  knob: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
});
