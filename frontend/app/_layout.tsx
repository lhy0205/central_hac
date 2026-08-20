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

  /* 글꼴이 준비되기 전에 그리면 시스템 글꼴로 한 번 그렸다가 바뀌어 글자가 튄다.
     네이티브 스플래시가 아직 떠 있는 구간이라 잠깐 비워도 사용자 눈에는 보이지 않는다.
     글꼴 로딩이 실패해도 앱은 떠야 하므로 fontError면 그냥 진행한다. */
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
