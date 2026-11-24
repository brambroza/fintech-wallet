import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  IBMPlexSansThai_400Regular,
  IBMPlexSansThai_500Medium,
  IBMPlexSansThai_600SemiBold,
  IBMPlexSansThai_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-thai";
import { StoreProvider } from "@/lib/store";
import { session } from "@/lib/session";
import { color } from "@/theme";

/** Re-lock the app with PIN after this long in the background. */
const LOCK_AFTER_MS = 60_000;
const PUBLIC = ["/", "/welcome", "/login", "/login-otp", "/unlock", "/register", "/register/otp", "/register/pin"];

export default function RootLayout() {
  const [loaded] = useFonts({ IBMPlexSansThai_400Regular, IBMPlexSansThai_500Medium, IBMPlexSansThai_600SemiBold, IBMPlexSansThai_700Bold });
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    let since = 0;
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "background") since = Date.now();
      if (st === "active" && since && Date.now() - since > LOCK_AFTER_MS && !PUBLIC.includes(pathRef.current)) {
        session.setAccess(null);
        router.replace("/unlock");
      }
    });
    return () => sub.remove();
  }, []);

  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: "slide_from_right" }}>
          <Stack.Screen name="index" options={{ animation: "none" }} />
          <Stack.Screen name="(tabs)" options={{ animation: "fade", gestureEnabled: false }} />
          <Stack.Screen name="unlock" options={{ animation: "fade", gestureEnabled: false }} />
          <Stack.Screen name="send/result" options={{ gestureEnabled: false }} />
          <Stack.Screen name="send/confirm" options={{ presentation: "modal" }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
