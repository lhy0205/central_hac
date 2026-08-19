import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Video from "react-native-video";

import { colors } from "../theme";

const SPLASH_VIDEO = require("../../assets/ar/videos/bag-editorial.mp4");

/* 스플래시 → 시작 화면 → 로그인/회원가입이 같은 배경을 쓴다.
   영상은 화면 전체를 채우고 그 위에 어두운 그라데이션을 깔아 글자가 읽히게 한다. */
export function BrandBackdrop({ dim = false }: { dim?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Video
        source={{ uri: SPLASH_VIDEO }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        repeat
        muted
      />
      <View style={[styles.scrim, dim && styles.scrimStrong]} />
    </View>
  );
}

// MCM | LXXVI + WORLDWIDE 워드마크.
export function BrandMark({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.mark, style]}>
      <View style={styles.markRow}>
        <Text style={styles.mcm}>MCM</Text>
        <View style={styles.box}>
          <Text style={styles.boxText}>LXXVI</Text>
        </View>
      </View>
      <Text style={styles.worldwide}>WORLDWIDE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,8,4,0.55)" },
  scrimStrong: { backgroundColor: "rgba(12,8,4,0.8)" },
  mark: { alignItems: "center" },
  markRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  mcm: { fontSize: 32, fontWeight: "700", color: colors.goldLight, letterSpacing: 0.6 },
  box: {
    borderWidth: 1.5,
    borderColor: "#C9A668",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  boxText: { fontSize: 19, color: "#E4CB93", letterSpacing: 1.5 },
  worldwide: {
    marginTop: 11,
    fontSize: 9,
    letterSpacing: 3.8,
    paddingLeft: 3.8,
    color: "rgba(226,203,150,0.66)",
  },
});
