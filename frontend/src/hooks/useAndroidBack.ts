import { router } from "expo-router";
import { useEffect } from "react";
import { BackHandler } from "react-native";
export function useAndroidBack(fallback = "/(tabs)/home", alwaysUseFallback = false) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!alwaysUseFallback && router.canGoBack()) router.back();
      else router.replace(fallback as never);
      return true;
    });
    return () => subscription.remove();
  }, [fallback, alwaysUseFallback]);
}
