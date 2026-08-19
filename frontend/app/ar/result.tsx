import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import ARResultScreen from "../../src/ar/screens/ARResultScreen";
import { type IdentifyResponse } from "../../src/ar/api";
import { useAndroidBack } from "../../src/hooks/useAndroidBack";
export default function ArResult() {
  useAndroidBack("/ar/scan", true);
  const { result } = useLocalSearchParams<{ result?: string }>();
  let parsed: IdentifyResponse | null = null;
  try {
    parsed = result ? JSON.parse(result) : null;
  } catch {
    parsed = null;
  }
  useEffect(() => {
    if (!parsed) router.replace("/ar/intro");
  }, []);
  function goHome() {
    if (router.canDismiss()) router.dismissAll();
    router.replace("/(tabs)/home");
  }
  if (!parsed) return null;
  return (
    <ARResultScreen
      result={parsed}
      onClose={goHome}
      onBack={() => router.replace("/ar/scan")}
      onHome={goHome}
    />
  );
}
