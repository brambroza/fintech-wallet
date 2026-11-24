/** Design tokens — mirror the "Fintech app UX/UI" canvas. Change here, not in screens. */
export const color = {
  bg: "#F5F7FA",
  surface: "#FFFFFF",
  ink: "#0E1726",
  muted: "#5B6576",
  faint: "#8A93A3",
  line: "#E3E7EE",
  field: "#CBD2DC",
  accent: "#1F4FD8",
  accentPressed: "#163BA6",
  accentSoft: "#E8EEFC",
  ok: "#127A4B",
  okSoft: "#E6F4EC",
  bad: "#B42318",
  badSoft: "#FDECEA",
  warn: "#B54708",
  warnInk: "#7A2E0B",
  warnSoft: "#FEF3E2",
  neutralSoft: "#EEF1F5",
  dark: "#0E1726",
} as const;

export const font = {
  regular: "IBMPlexSansThai_400Regular",
  medium: "IBMPlexSansThai_500Medium",
  semibold: "IBMPlexSansThai_600SemiBold",
  bold: "IBMPlexSansThai_700Bold",
} as const;

export const radius = { sm: 12, md: 14, lg: 16, xl: 20, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
/** Minimum touch target (iOS HIG / Material). */
export const hit = 44;
