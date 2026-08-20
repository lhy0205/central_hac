import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandBackdrop, BrandMark } from "../../src/components/BrandBackdrop";

/* 스플래시가 끝나면 나오는 시작 화면. 배경 영상은 계속 돌고, 로고만 가운데로 내려온다. */
export default function Landing() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <BrandBackdrop />
      <BrandMark style={styles.mark} />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 44 }]}>
        <Pressable
          onPress={() => router.push("/(auth)/signup")}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>시작하기</Text>
        </Pressable>
        <Text style={styles.hint}>
          이미 회원이신가요?{" "}
          <Text onPress={() => router.push("/(auth)/login")} style={styles.link}>
            로그인
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#150E06" },
  mark: { position: "absolute", left: 0, right: 0, top: "34%" },
  bottom: { position: "absolute", left: 26, right: 26, bottom: 0 },
  cta: {
    height: 54,
    borderRadius: 27,
    backgroundColor: "#D2AC6B",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.98 }] },
  ctaText: { fontSize: 15, fontWeight: "700", color: "#2B1C12" },
  hint: { marginTop: 15, textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.6)" },
  link: { color: "#E4CB93", fontWeight: "700", textDecorationLine: "underline" },
});
