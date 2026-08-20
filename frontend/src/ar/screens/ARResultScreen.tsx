import React, { useRef } from "react";
import {
  Animated,
  PanResponder,
  useWindowDimensions,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Text } from "../../components/BrandText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Video, { ViewType } from "react-native-video";
import { colors, spacing, radii } from "../design";
import { IDENTIFY_CONFIDENCE_THRESHOLD, type IdentifyResponse } from "../api";
import { getProductClassLabel } from "../productLabels";
import { getStory } from "../storyData";
import { getStoryVideo } from "../storyVideos";

const BAG_FAMILY = new Set(["Handbag", "Backpack", "Suitcase", "Wallet"]);

const HANDLE_HEIGHT = 40;
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function ARResultScreen({
  result,
  onClose,
  onBack,
  onHome,
}: {
  result: IdentifyResponse;
  onClose: () => void;
  onBack: () => void;
  onHome: () => void;
}) {
  const insets = useSafeAreaInsets();
  const windowHeight = useWindowDimensions().height;

  const SHEET_HEIGHT = Math.round(windowHeight * 0.62);
  const PEEK_HEIGHT = HANDLE_HEIGHT + insets.bottom + 12;
  const COLLAPSED_Y = SHEET_HEIGHT - PEEK_HEIGHT;

  const primary =
    [...result.detections].sort((a, b) => {
      const aBag = BAG_FAMILY.has(a.class) ? 1 : 0;
      const bBag = BAG_FAMILY.has(b.class) ? 1 : 0;
      if (aBag !== bBag) return bBag - aBag;
      return b.confidence - a.confidence;
    })[0] ?? null;
  const topCandidate = primary?.candidates[0] ?? null;
  const isLowConfidence =
    topCandidate == null || topCandidate.similarity < IDENTIFY_CONFIDENCE_THRESHOLD;

  const story = primary != null ? getStory(primary.class) : null;
  const videoSource =
    primary != null ? getStoryVideo(primary.class, topCandidate?.productId ?? primary.class) : null;

  const collapsedYRef = useRef(COLLAPSED_Y);
  collapsedYRef.current = COLLAPSED_Y;

  const translateY = useRef(new Animated.Value(COLLAPSED_Y)).current;

  const sheetBackdropOpacity = translateY.interpolate({
    inputRange: [0, COLLAPSED_Y],
    outputRange: [1, 0.32],
    extrapolate: "clamp",
  });
  const dragStartY = useRef(COLLAPSED_Y);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        translateY.stopAnimation((value) => {
          dragStartY.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(clamp(dragStartY.current + gesture.dy, 0, collapsedYRef.current));
      },
      onPanResponderRelease: (_, gesture) => {
        const collapsedY = collapsedYRef.current;

        const isTap = Math.abs(gesture.dy) < 6 && Math.abs(gesture.vy) < 0.1;
        const expand = isTap
          ? dragStartY.current > collapsedY / 2
          : gesture.vy < -0.3
            ? true
            : gesture.vy > 0.3
              ? false
              : clamp(dragStartY.current + gesture.dy, 0, collapsedY) < collapsedY / 2;
        Animated.spring(translateY, {
          toValue: expand ? 0 : collapsedY,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    }),
  ).current;

  if (primary == null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={onClose}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>제품을 찾지 못했어요</Text>
          <Text style={styles.emptyBody}>
            가방·지갑 같은 제품 전체가 안내선 안에 들어오도록 밝은 곳에서 다시 시도해주세요.
          </Text>
        </View>
        <View style={styles.navRow}>
          <Pressable
            style={({ pressed }) => [
              styles.navButton,
              styles.navButtonSecondary,
              pressed && styles.navButtonPressed,
            ]}
            onPress={onBack}
          >
            <Text style={styles.navButtonSecondaryText}>다시 스캔하기</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.navButton,
              styles.navButtonPrimary,
              pressed && styles.navButtonPressed,
            ]}
            onPress={onHome}
          >
            <Text style={styles.navButtonPrimaryText}>홈으로 가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {}
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <Video
        source={videoSource}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        repeat
        muted

        viewType={ViewType.TEXTURE}
      />
      <View style={styles.scrim} pointerEvents="none" />

      <SafeAreaView style={styles.overlayTop} edges={["top"]}>
        <Pressable hitSlop={12} style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeIconOnVideo}>✕</Text>
        </Pressable>
      </SafeAreaView>

      <Animated.View style={[styles.sheet, { height: SHEET_HEIGHT, transform: [{ translateY }] }]}>
        <Animated.View
          style={[styles.sheetBackdrop, { opacity: sheetBackdropOpacity }]}
          pointerEvents="none"
        />
        <View
          style={[styles.sheetGrip, { height: PEEK_HEIGHT }]}
          hitSlop={{ top: 16, bottom: 16, left: 40, right: 40 }}
          {...panResponder.panHandlers}
        >
          <View style={styles.sheetHandle} />
        </View>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.categoryRow}>
            <Text style={styles.categoryBadge}>{getProductClassLabel(primary.class)}</Text>
            <Text style={styles.categoryConfidence}>
              탐지 확신도 {(primary.confidence * 100).toFixed(0)}%
            </Text>
          </View>

          {story != null && (
            <View style={styles.storyBox}>
              <Text style={styles.storyEmoji}>{story.emoji}</Text>
              <Text style={styles.storyText}>{story.story}</Text>
            </View>
          )}

          {isLowConfidence && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                정확히 일치하는 제품을 찾지 못했어요. 단종되었거나 갤러리에 없는 제품일 수 있어요 —
                아래는 가장 비슷한 후보예요.
              </Text>
            </View>
          )}

          {primary.candidates.length === 0 ? (
            <Text style={styles.emptyBody}>후보 제품이 없어요.</Text>
          ) : (
            <View style={styles.candidateList}>
              {primary.candidates.map((candidate, index) => (
                <View
                  key={candidate.productId}
                  style={[styles.candidateCard, index === 0 && styles.candidateCardPrimary]}
                >
                  <View style={styles.candidateRank}>
                    <Text style={styles.candidateRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName} numberOfLines={2}>
                      {candidate.name ?? `상품 ${candidate.productId}`}
                    </Text>
                    <View style={styles.similarityTrack}>
                      <View
                        style={[
                          styles.similarityFill,
                          { width: `${Math.max(0, Math.min(1, candidate.similarity)) * 100}%` },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={styles.candidateSimilarity}>
                    {(candidate.similarity * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.navRowSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            style={({ pressed }) => [
              styles.navButton,
              styles.navButtonSecondary,
              pressed && styles.navButtonPressed,
            ]}
            onPress={onBack}
          >
            <Text style={styles.navButtonSecondaryText}>다시 스캔하기</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.navButton,
              styles.navButtonPrimary,
              pressed && styles.navButtonPressed,
            ]}
            onPress={onHome}
          >
            <Text style={styles.navButtonPrimaryText}>홈으로 가기</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayScrim,
  },

  header: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: spacing.md,
    height: 52,
    alignItems: "center",
  },
  closeIcon: { fontSize: 20, color: colors.ink },

  overlayTop: { position: "absolute", top: 0, left: 0, right: 0 },
  closeButton: {
    marginTop: spacing.sm,
    marginLeft: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlayDark,
  },
  closeIconOnVideo: { fontSize: 17, color: "#fff" },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: "hidden",
  },

  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
  },
  sheetGrip: {
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
    opacity: 0.35,
  },

  sheetScroll: { flex: 1 },
  sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },

  storyBox: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.iconBadgeBg,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  storyEmoji: { fontSize: 20 },
  storyText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 19 },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.xs },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  emptyBody: { fontSize: 14, color: colors.inkSoft, lineHeight: 20, textAlign: "center" },

  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryBadge: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    backgroundColor: colors.iconBadgeBg,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  categoryConfidence: { fontSize: 12, color: colors.inkSoft },

  warningBanner: {
    backgroundColor: colors.iconBadgeBg,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  warningText: { fontSize: 12, color: colors.cognac, lineHeight: 17 },

  candidateList: { gap: spacing.sm },
  candidateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  candidateCardPrimary: { borderColor: colors.gold, borderWidth: 1.5 },
  candidateRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.iconBadgeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  candidateRankText: { fontSize: 12, fontWeight: "700", color: colors.cognac },
  candidateInfo: { flex: 1, gap: 6 },
  candidateName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  similarityTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  similarityFill: { height: 4, borderRadius: 2, backgroundColor: colors.gold },
  candidateSimilarity: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    minWidth: 36,
    textAlign: "right",
  },

  navRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  navRowSheet: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  navButtonPressed: { opacity: 0.85 },
  navButtonSecondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  navButtonSecondaryText: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  navButtonPrimary: { backgroundColor: colors.ink },
  navButtonPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
