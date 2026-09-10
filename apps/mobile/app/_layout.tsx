import { Platform, View, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { LoadingState } from "../src/components/shared/LoadingState";
import "../global.css";

SplashScreen.preventAutoHideAsync();

/**
 * Auth guard: whenever `status` changes (sign in, sign out, forced sign-out
 * on a 401, ...) make sure the visible screen actually matches it. Without
 * this, calling signOut() while deep in (app) just changes state — nothing
 * navigates anywhere, so the user stays stuck on the old screen.
 */
function RootNavigator() {
  const { status, signingOut, clearSigningOut, takePendingRedirect } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Expo Router's generated type for useSegments() only lists the known
    // static routes' lengths (never 0), but at runtime it IS briefly `[]`
    // before the navigator has mounted — widen the type for this check so
    // that real, transient empty-array case still short-circuits correctly.
    if (status === "loading" || (segments as readonly string[]).length === 0) return;
    const inAuthGroup = segments[0] === "(auth)";

    if (status === "signedOut" && !inAuthGroup) {
      router.replace("/(auth)/landing");
    } else if (status === "signedIn" && inAuthGroup) {
      // This is the ONLY place that navigates on a signedOut→signedIn
      // transition — a screen (e.g. otp.tsx after confirmOtp) that also
      // called router.replace right after its own await used to race this
      // effect, and which one "won" depended on render/microtask timing.
      // Screens instead call setPendingRedirect() beforehand and let this
      // effect do the actual navigating, so there's only ever one mover.
      router.replace((takePendingRedirect() ?? "/(app)/groups") as any);
    }

    // Only clear once we've actually landed on (auth) — keeps the
    // full-screen sign-out loader up for the whole redirect instead of
    // dropping it the instant signOut() resolves, before navigation lands.
    if (signingOut && inAuthGroup) clearSigningOut();
  }, [status, segments, router, signingOut, clearSigningOut, takePendingRedirect]);

  return (
    <View style={{ flex: 1 }}>
      {/* Stack must stay mounted even while signing out — it's the actual
          navigator that processes router.replace() and updates useSegments().
          Unmounting it to show the loader breaks the redirect entirely,
          leaving signingOut stuck true forever. Overlay on top instead. */}
      <Stack screenOptions={{ animation: Platform.OS === "web" ? "none" : "default" }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
      {signingOut ? (
        <View style={StyleSheet.absoluteFill}>
          <LoadingState label="Signing you out…" />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
