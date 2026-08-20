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

// AR 스캔이 겨냥하는 제품군(탐지 모델 17클래스 중). 나머지(의류·신발 등)는 대표 탐지로 올리지 않는다.
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
  // PEEK_HEIGHT에 하단 세이프에어리어를 더해야 한다 — 안 그러면 핸들이 화면 맨 아래에 붙어서
  // 제스처 내비게이션 기기에서 터치가 시스템 제스처에 먼저 먹혀버린다.
  const SHEET_HEIGHT = Math.round(windowHeight * 0.62);
  const PEEK_HEIGHT = HANDLE_HEIGHT + insets.bottom + 12;
  const COLLAPSED_Y = SHEET_HEIGHT - PEEK_HEIGHT;

  // 확신도 최댓값으로만 고르면 배경의 바지가 가방보다 점수가 높아서 바지 스토리가 뜨는
  // 경우가 있다. 가방류를 먼저 우선하고, 그 안에서 확신도로 정렬한다.
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
  // 탐지 자체가 실패하면 영상 없이 안내 문구만 보여준다.
  const story = primary != null ? getStory(primary.class) : null;
  const videoSource =
    primary != null ? getStoryVideo(primary.class, topCandidate?.productId ?? primary.class) : null;

  // PanResponder 콜백 클로저는 최초 렌더 때 고정되므로 COLLAPSED_Y를 직접 담으면
  // 인셋 갱신이 늦은 기기에서 stale 값을 쓴다. ref로 우회.
  const collapsedYRef = useRef(COLLAPSED_Y);
  collapsedYRef.current = COLLAPSED_Y;

  const translateY = useRef(new Animated.Value(COLLAPSED_Y)).current;
  // 접혔을 때는 카드 배경이 반투명해서 뒤로 영상이 비치고, 위로 끌수록 흰색이 또렷해진다.
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
        // 드래그가 거의 없었으면(=탭) 현재 상태를 뒤집는다.
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
      {/* 전신 영상 화면이라 상태바도 밝게 — 다른 화면은 흰 배경이라 루트에서 dark로 고정해뒀는데
          여기서만 덮어쓴다. 화면 벗어나면 자동 복귀. */}
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <Video
        source={videoSource}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        repeat
        muted
        // 기본 SurfaceView는 루프마다 서페이스를 재할당해서 검은 프레임이 잠깐 끼어든다.
        // TextureView는 뷰 계층 안에서 그려져서 그게 없다(안드로이드 전용).
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

        {/* 시트가 화면 맨 아래에 붙어 있어, 버튼이 내비게이션 바에 물린다. 그만큼만 띄운다. */}
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

  // 영상 위 바텀시트형 카드 패널. 처음엔 핸들만 보이게 접혀 있다가 위로 끌면 펼쳐진다 —
  // translateY로 위치를 옮기므로 높이는 고정값이어야 한다.
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: "hidden",
  },
  // sheet 자체가 아니라 이 레이어의 불투명도만 애니메이션한다 — 핸들/텍스트는 항상 또렷해야 한다.
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
  /* 시트는 높이가 고정(화면의 62%)이고 overflow가 hidden이다. 여기서 flexGrow를 0으로 두면
     스크롤뷰가 내용 높이만큼 그대로 자라서, 내용이 길면 아래 버튼 줄을 시트 밖으로 밀어낸다 —
     그래서 "다시 스캔하기/홈으로 가기"가 반쯤 잘려 보였다. 남은 공간만 차지하고 안에서
     스크롤하도록 flex를 준다. 버튼 줄은 언제나 시트 안에 남는다. */
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
