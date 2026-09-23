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

function RootNavigator() {
  const { status, signingOut, clearSigningOut, takePendingRedirect } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
   
    if (status === "loading" || (segments as readonly string[]).length === 0) return;
    const inAuthGroup = segments[0] === "(auth)";

    if (status === "signedOut" && !inAuthGroup) {
      router.replace("/(auth)/landing");
    } else if (status === "signedIn" && inAuthGroup) {
      router.replace((takePendingRedirect() ?? "/(app)/groups") as any);
    }

    if (signingOut && inAuthGroup) clearSigningOut();
  }, [status, segments, router, signingOut, clearSigningOut, takePendingRedirect]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ animation: Platform.OS === "web" ? "none" : "default" }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* No slide between signed-in and signed-out: the page being left would show while it animates away. */}
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: "none" }} />
        <Stack.Screen name="(app)" options={{ headerShown: false, animation: "none" }} />
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
