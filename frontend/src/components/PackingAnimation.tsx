import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

const bagImage = require("../../assets/mcm-bag.png");

/* 등록 완료 화면의 패킹 모션. 가방이 위에서 상자로 떨어지고 뚜껑이 닫히면서
   "My MCM" 라벨이 뜬다 — 디자인 파일(MCM Splash Loading.dc.html)의 6a 아트보드를
   React Native로 옮긴 것이라 타이밍(6초 루프)도 그대로다. */
export function PackingAnimation() {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  // 원본 keyframes: 0% 위에서 시작 → 42% 바닥 근처 → 50% 안착
  const bagY = t.interpolate({
    inputRange: [0, 0.32, 0.42, 0.5, 1],
    outputRange: [-215, -34, 10, 22, 22],
  });
  const bagOpacity = t.interpolate({ inputRange: [0, 0.07, 1], outputRange: [0, 1, 1] });
  const bagScale = t.interpolate({
    inputRange: [0, 0.32, 0.42, 0.5, 1],
    outputRange: [1, 0.92, 0.86, 0.84, 0.84],
  });
  // 뚜껑 두 짝이 시차를 두고 닫힌다.
  const flapFar = t.interpolate({
    inputRange: [0, 0.4, 0.62, 1],
    outputRange: ["-104deg", "-104deg", "0deg", "0deg"],
  });
  const flapNear = t.interpolate({
    inputRange: [0, 0.44, 0.66, 1],
    outputRange: ["104deg", "104deg", "0deg", "0deg"],
  });
  const labelOpacity = t.interpolate({
    inputRange: [0, 0.66, 0.78, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={styles.stage}>
      <View style={styles.shadow} />
      <View style={styles.box}>
        <View style={styles.inner} />

        <Animated.View
          style={[
            styles.bag,
            { opacity: bagOpacity, transform: [{ translateY: bagY }, { scale: bagScale }] },
          ]}
        >
          <Image source={bagImage} style={styles.bagImage} />
        </Animated.View>

        <View style={styles.front}>
          <Animated.View style={{ opacity: labelOpacity }}>
            <Text style={styles.brand}>My MCM</Text>
            <Text style={styles.serial}>LXXVI · 1976</Text>
          </Animated.View>
        </View>

        <View style={styles.lidWrap}>
          <Animated.View style={[styles.lidFar, { transform: [{ rotateX: flapFar }] }]} />
          <Animated.View style={[styles.lidNear, { transform: [{ rotateX: flapNear }] }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 250, height: 190, alignItems: "center", justifyContent: "flex-end" },
  shadow: {
    position: "absolute",
    bottom: 2,
    width: 150,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(43,28,18,0.16)",
  },
  box: { width: 160, height: 150, alignItems: "center" },
  inner: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 38,
    height: 72,
    backgroundColor: "#241609",
    borderRadius: 3,
  },
  bag: { position: "absolute", top: 20, width: 76, height: 96, zIndex: 2 },
  bagImage: { width: "100%", height: "100%", resizeMode: "contain" },
  front: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 68,
    height: 70,
    zIndex: 6,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    backgroundColor: "#B9954E",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: "#2B1C12", fontSize: 16, fontWeight: "600", letterSpacing: 2 },
  serial: { color: "#4A3626", fontSize: 7, letterSpacing: 2.4, textAlign: "center", marginTop: 4 },
  lidWrap: { position: "absolute", left: 14, right: 14, top: 22, height: 48, zIndex: 4 },
  lidFar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 48,
    backgroundColor: "#CBAA6B",
    borderWidth: 1,
    borderColor: "rgba(255,248,225,0.4)",
    borderRadius: 2,
  },
  lidNear: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    backgroundColor: "#BC9A57",
    borderWidth: 1,
    borderColor: "rgba(255,248,225,0.35)",
    borderRadius: 2,
  },
});
