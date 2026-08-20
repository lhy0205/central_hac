import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../components/BrandText";
import { SafeAreaView } from "react-native-safe-area-context";

const BROWN = "#77531D";

export default function ARIntroScreen({
  onBack,
  onAllow,
}: {
  onBack?: () => void;
  onAllow: () => void;
}) {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="뒤로가기"
          hitSlop={12}
          onPress={onBack}
          style={styles.headerSide}
        >
          {onBack ? <Text style={styles.chevron}>‹</Text> : null}
        </Pressable>
        <Text style={styles.headerTitle}>AR</Text>
        <View style={styles.headerSide} />
      </View>
      <View style={styles.headerRule} />

      <View style={styles.content}>
        <View style={styles.artwork}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          <View style={styles.glow} />
          <View style={styles.bagHandle} />
          <View style={styles.bagBody}>
            <View style={styles.bagSeam} />
            <View style={styles.patternRow}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={styles.diamond} />
              ))}
            </View>
            <View style={[styles.patternRow, styles.patternRowBottom]}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={styles.diamond} />
              ))}
            </View>
          </View>
          <View style={styles.sparkle}>
            <Text style={styles.sparkleText}>✧</Text>
          </View>
          <View style={styles.scanDots}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <View key={item} style={styles.scanDot} />
            ))}
          </View>
        </View>

        <View style={styles.messageBlock}>
          <Text style={styles.heading}>제품을 비추면 새로운 이야기가 시작됩니다</Text>
          <Text style={styles.description}>AR로 MCM 제품을 비춰보세요</Text>
          <Text style={styles.description}>
            제품에 담긴 이야기와 특별한 콘텐츠를 만나볼 수 있습니다
          </Text>
        </View>

        <View style={styles.feature}>
          <View style={styles.focusIcon}>
            <View style={[styles.focusCorner, styles.focusTopLeft]} />
            <View style={[styles.focusCorner, styles.focusTopRight]} />
            <View style={[styles.focusCorner, styles.focusBottomLeft]} />
            <View style={[styles.focusCorner, styles.focusBottomRight]} />
          </View>
          <View>
            <Text style={styles.featureTitle}>실시간 가방 인식</Text>
            <Text style={styles.featureDescription}>촬영 중에만 카메라를 사용해요</Text>
          </View>
        </View>

        <View style={styles.flexSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="AR 시작하기"
          onPress={onAllow}
          style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
        >
          <Text style={styles.startButtonText}>시작하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  header: {
    height: 58,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSide: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
  chevron: { fontSize: 31, lineHeight: 34, fontWeight: "300", color: "#555" },
  headerTitle: { fontSize: 16, color: "#333" },
  headerRule: { height: 1, marginHorizontal: 22, backgroundColor: "#E5DED4" },
  content: { flex: 1, paddingHorizontal: 31, paddingTop: 50, paddingBottom: 12 },
  artwork: {
    width: 190,
    height: 190,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: { width: 116, height: 116, borderRadius: 58, backgroundColor: "#F7EFE0" },
  corner: { position: "absolute", width: 34, height: 34, borderColor: BROWN },
  topLeft: { top: 10, left: 9, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 7 },
  topRight: { top: 10, right: 9, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 7 },
  bottomLeft: {
    bottom: 10,
    left: 9,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 7,
  },
  bottomRight: {
    bottom: 10,
    right: 9,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 7,
  },
  bagHandle: {
    position: "absolute",
    top: 58,
    width: 40,
    height: 38,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: BROWN,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 2,
  },
  bagBody: {
    position: "absolute",
    top: 84,
    width: 82,
    height: 65,
    borderWidth: 2,
    borderColor: BROWN,
    borderRadius: 7,
    backgroundColor: "#FFF9ED",
    alignItems: "center",
  },
  bagSeam: { width: 2, height: 63, backgroundColor: "#B89358" },
  patternRow: {
    position: "absolute",
    top: 16,
    left: 13,
    right: 13,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  patternRowBottom: { top: 42 },
  diamond: {
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: BROWN,
    transform: [{ rotate: "45deg" }],
  },
  sparkle: { position: "absolute", right: 30, top: 24 },
  sparkleText: { fontSize: 25, color: BROWN },
  scanDots: {
    position: "absolute",
    left: 9,
    right: 9,
    top: 98,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scanDot: { width: 3, height: 3, backgroundColor: BROWN, transform: [{ rotate: "45deg" }] },
  messageBlock: { alignItems: "center", marginTop: 70 },
  heading: { fontSize: 18, color: "#2F2F2F", textAlign: "center", marginBottom: 41 },
  description: { fontSize: 14, lineHeight: 21, color: "#777", textAlign: "center" },
  feature: {
    minHeight: 92,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E4DED5",
    marginTop: 43,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 19,
  },
  focusIcon: { width: 27, height: 27, position: "relative" },
  focusCorner: { position: "absolute", width: 9, height: 9, borderColor: BROWN },
  focusTopLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  focusTopRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  focusBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  focusBottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  featureTitle: { fontSize: 14, color: "#333", marginBottom: 9 },
  featureDescription: { fontSize: 11, color: "#AAA" },
  flexSpacer: { flex: 1, minHeight: 28 },
  startButton: {
    height: 60,
    borderRadius: 8,
    backgroundColor: "#292927",
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonPressed: { opacity: 0.82 },
  startButtonText: { color: "#FFF", fontSize: 14 },
});
