import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { BrandBackdrop, BrandMark } from "../src/components/BrandBackdrop";
import { useAuth } from "../src/context/AuthContext";

const SPLASH_MS = 2300;

/* 앱 첫 화면. 네이티브 스플래시가 걷힌 뒤 이 브랜드 스플래시가 잠깐 재생되고,
   로딩 바가 다 차면 로그인 여부에 따라 홈이나 시작 화면으로 넘어간다. */
export default function Index() {
  const insets = useSafeAreaInsets();
  const { ready, token } = useAuth();
  const [done, setDone] = useState(false);
  const track = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(track, {
      toValue: 1,
      duration: SPLASH_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    const timer = setTimeout(() => setDone(true), SPLASH_MS + 300);
    return () => clearTimeout(timer);
  }, [track]);

  if (done && ready) {
    return <Redirect href={token ? "/(tabs)/home" : "/(auth)/landing"} />;
  }

  const width = track.interpolate({ inputRange: [0, 1], outputRange: ["4%", "100%"] });

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <BrandBackdrop />
      <BrandMark style={styles.mark} />
      <View style={[styles.bottom, { bottom: insets.bottom + 32 }]}>
        <Text style={styles.copy}>2026 가을 컬렉션{"\n"}지금 만나보세요</Text>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width }]} />
        </View>
        <Text style={styles.loading}>로드 중 · LOADING</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#150E06" },
  mark: { position: "absolute", left: 0, right: 0, top: "11%" },
  bottom: { position: "absolute", left: 26, right: 26 },
  copy: { fontSize: 16, lineHeight: 25, color: "#F0E7D6", fontWeight: "500", marginBottom: 20 },
  track: { height: 1, backgroundColor: "rgba(226,203,150,0.22)", marginBottom: 13 },
  fill: { height: 1, backgroundColor: "#C9A668" },
  loading: { fontSize: 8.5, letterSpacing: 2.6, color: "rgba(226,203,150,0.6)" },
});
