import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { AuthProvider } from "../src/context/AuthContext";
import { ChromeProvider } from "../src/context/ChromeContext";
import { FONTS } from "../src/theme/fonts";

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts(FONTS);

  if (!fontsReady && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <ChromeProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#fff" },
              }}
            />
          </ChromeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
