import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video from "react-native-video";

import { ApiError, productApi, type PassportSummary } from "../../src/api/client";
import { useTabBarClearance } from "../../src/components/BottomTabBar";
import { NotificationBubble } from "../../src/components/NotificationBubble";
import { useChrome } from "../../src/context/ChromeContext";
import { AD_SLIDES } from "../../src/home/adFeed";
import { colors, gradeColor, gradeLabel } from "../../src/theme";

const bagImage = require("../../assets/mcm-bag.png");
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_W - 48;

/* 카드에 구매일·구입 장소를 보여줘야 하는데 목록 응답(PassportSummary)에는 그 두 필드가 없다.
   가방 수가 많지 않아 상세를 병렬로 한 번 더 받아 합친다. 목록 응답에 필드가 생기면
   이 추가 요청은 지워도 된다. */
type BagCard = PassportSummary & { purchaseDate?: string; purchasePlace?: string | null };

function formatDate(value?: string) {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ". ");
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const dockBottom = useTabBarClearance(14);
  const { setTabBarHidden } = useChrome();
  const [bags, setBags] = useState<BagCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const hiddenRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        BackHandler.exitApp();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  // 화면을 벗어날 때 숨김이 남아 있으면 다른 탭에서 탭바가 사라진 채로 보인다.
  useFocusEffect(
    useCallback(() => {
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      productApi
        .list()
        .then(async (res) => {
          const details = await Promise.all(
            res.content.map((item) => productApi.detail(String(item.id)).catch(() => null)),
          );
          if (!active) return;
          setBags(
            res.content.map((item, index) => ({
              ...item,
              purchaseDate: details[index]?.purchaseDate,
              purchasePlace: details[index]?.purchasePlace,
            })),
          );
          setLoadError(null);
        })
        .catch((err) => {
          if (active)
            setLoadError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [reloadKey]),
  );

  // 배경 광고를 조금이라도 내리면 아이콘바와 내 가방이 통째로 사라지고,
  // 맨 위까지 되돌아오면 다시 나타난다.
  const onFeedScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const next = y > 24 ? true : y <= 2 ? false : hiddenRef.current;
    if (next !== hiddenRef.current) {
      hiddenRef.current = next;
      setChromeHidden(next);
      setTabBarHidden(next);
    }
  };

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveSlide(first.index);
  }).current;

  const cards = bags ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={AD_SLIDES}
        keyExtractor={(item) => item.key}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onScroll={onFeedScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        // 아래 renderItem이 이웃만 붙이도록 해도, FlatList가 창을 넓게 잡으면 소용이 없다.
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        renderItem={({ item, index }) => (
          <View style={[styles.slide, { height: SCREEN_H }]}>
            {/* 안드로이드가 동시에 열 수 있는 하드웨어 비디오 디코더는 2~4개뿐이다. 슬라이드
                4개의 Video를 한꺼번에 붙여 두면 MediaCodec이 바닥나 네이티브에서 앱이 그대로
                죽는다(paused여도 디코더는 잡고 있다). 지금 슬라이드와 바로 이웃만 붙인다. */}
            {Math.abs(index - activeSlide) <= 1 ? (
              <Video
                // v6는 번들 에셋도 source.uri로 받는다.
                source={{ uri: item.source }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
                repeat
                muted
                paused={index !== activeSlide}
              />
            ) : null}
            <View style={styles.scrimTop} pointerEvents="none" />
            <View style={styles.scrimBottom} pointerEvents="none" />
            <View style={[styles.adTag, { bottom: chromeHidden ? 150 : 330 }]} pointerEvents="none">
              <Text style={styles.adBadge}>{item.badge}</Text>
              <Text style={styles.adTitle}>{item.title}</Text>
              <Text style={styles.adCaption}>{item.caption}</Text>
            </View>
          </View>
        )}
      />

      {/* 헤더와 검색은 영상 위에 떠 있다 — 영상이 화면 맨 위까지 올라온다. */}
      <View style={[styles.top, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.logo}>
            MCM<Text style={styles.logoCare}>Care</Text>
          </Text>
          <Pressable
            accessibilityLabel="알림"
            hitSlop={12}
            onPress={() => setBubbleOpen(true)}
            style={({ pressed }) => [styles.bell, pressed && styles.bellPressed]}
          >
            <View style={styles.bellBody} />
            <View style={styles.bellClapper} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <View style={styles.searchLens} />
            <View style={styles.searchHandle} />
            <TextInput
              accessibilityLabel="제품 검색"
              placeholder="Search"
              placeholderTextColor="#8B8B8B"
              style={styles.searchInput}
            />
            <View style={styles.mic}>
              <View style={styles.micHead} />
              <View style={styles.micArc} />
            </View>
          </View>
        </View>
      </View>

      {/* 탭바가 실제로 차지하는 높이(내비게이션 바 포함)만큼 띄워야 카드가 안 가린다. */}
      {!chromeHidden && (
        <View style={[styles.dock, { bottom: dockBottom }]} pointerEvents="box-none">
          <View style={styles.dockInner}>
            <Text style={styles.dockLabel}>내 가방</Text>

            {loading ? (
              <View style={styles.dockState}>
                <ActivityIndicator />
              </View>
            ) : loadError != null ? (
              <View style={styles.dockState}>
                <Text style={styles.dockError}>{loadError}</Text>
                <Pressable onPress={() => setReloadKey((key) => key + 1)}>
                  <Text style={styles.retry}>다시 시도</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={[...cards, null]}
                keyExtractor={(item, index) => (item ? String(item.id) : `add-${index}`)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) =>
                  setCardIndex(
                    Math.round(
                      event.nativeEvent.contentOffset.x /
                        Math.max(1, event.nativeEvent.layoutMeasurement.width),
                    ),
                  )
                }
                renderItem={({ item }) =>
                  item ? <BagCardView bag={item} /> : <RegisterCardView />
                }
              />
            )}

            {cards.length > 0 && (
              <View style={styles.dots}>
                {[...cards, null].map((_, index) => (
                  <View key={index} style={[styles.dot, index === cardIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      <NotificationBubble
        open={bubbleOpen}
        onClose={() => setBubbleOpen(false)}
        topOffset={insets.top + 46}
      />
    </View>
  );
}

function BagCardView({ bag }: { bag: BagCard }) {
  const color = gradeColor(bag.overallGrade);
  return (
    <View style={styles.cardWrap}>
      {/* 테두리 색이 곧 AI 진단 등급이다. */}
      <View style={[styles.card, { borderColor: color }]}>
        <View style={styles.thumb}>
          <Image source={bagImage} style={styles.thumbImage} />
        </View>
        <View style={styles.info}>
          <Text numberOfLines={2} style={styles.bagName}>
            {bag.nickname || bag.modelName}
          </Text>
          <View style={styles.gradeRow}>
            <View style={[styles.gradeDot, { backgroundColor: color }]} />
            <Text style={styles.gradeText}>
              {bag.overallGrade ? `등급 ${gradeLabel(bag.overallGrade)}` : "진단 전"} ·{" "}
              {bag.ownershipDays}일
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.meta}>
            구매일 : {formatDate(bag.purchaseDate)}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            구입 장소 : {bag.purchasePlace || "-"}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                router.push({ pathname: "/care/booking", params: { id: String(bag.id) } })
              }
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnPrimaryText}>공식 예약</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({ pathname: "/care/self", params: { id: String(bag.id) } })
              }
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnGhostText}>셀프 케어</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() =>
              router.push({ pathname: "/bags/detail", params: { id: String(bag.id) } })
            }
          >
            <Text style={styles.diagLink}>최근 진단 결과 보기 ›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RegisterCardView() {
  return (
    <View style={styles.cardWrap}>
      <Pressable
        accessibilityLabel="제품 등록"
        onPress={() => router.push("/register")}
        style={({ pressed }) => [styles.card, styles.addCard, pressed && styles.addPressed]}
      >
        <Text style={styles.plus}>＋</Text>
        <View style={styles.addRule} />
        <Text style={styles.addLabel}>제품 등록</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  slide: { width: "100%", backgroundColor: "#111" },
  scrimTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 220,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  scrimBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  adTag: { position: "absolute", left: 16 },
  adBadge: {
    alignSelf: "flex-start",
    color: "#fff",
    fontSize: 10,
    letterSpacing: 1.4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 8,
  },
  adTitle: { color: "#fff", fontSize: 19, fontWeight: "600" },
  adCaption: { color: "rgba(255,255,255,0.82)", fontSize: 12, marginTop: 3 },

  top: { position: "absolute", left: 0, right: 0, top: 0 },
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { fontSize: 19, fontWeight: "800", color: "#fff", letterSpacing: -0.4 },
  logoCare: { fontSize: 15, fontWeight: "400", color: "rgba(255,255,255,0.72)" },
  bell: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  bellPressed: { backgroundColor: "rgba(255,255,255,0.2)" },
  bellBody: {
    width: 16,
    height: 15,
    borderWidth: 1.7,
    borderColor: "#fff",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 0,
  },
  bellClapper: { width: 6, height: 1.7, backgroundColor: "#fff", marginTop: 2, borderRadius: 1 },

  searchWrap: { paddingHorizontal: 14, paddingTop: 10 },
  searchBar: {
    height: 44,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.92)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 9,
  },
  searchLens: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.8, borderColor: "#6E6E6E" },
  searchHandle: {
    position: "absolute",
    left: 26,
    top: 25,
    width: 6,
    height: 1.8,
    backgroundColor: "#6E6E6E",
    transform: [{ rotate: "45deg" }],
  },
  searchInput: { flex: 1, fontSize: 15, color: "#222", padding: 0 },
  // 마이크: 캡슐 머리 + 아래를 감싸는 반원. 캡슐만 두면 숫자 0처럼 보인다.
  mic: { width: 14, height: 18, alignItems: "center", justifyContent: "flex-start" },
  micHead: { width: 7, height: 10, borderRadius: 3.5, backgroundColor: "#6E6E6E" },
  micArc: {
    width: 13,
    height: 7,
    marginTop: 1,
    borderWidth: 1.6,
    borderTopWidth: 0,
    borderColor: "#6E6E6E",
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
  },

  dock: { position: "absolute", left: 0, right: 0 },
  dockInner: {
    marginHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dockLabel: { fontSize: 13, fontWeight: "700", color: "#111", paddingBottom: 9, paddingLeft: 2 },
  dockState: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 10 },
  dockError: { fontSize: 12, color: "#666", textAlign: "center" },
  retry: { fontSize: 13, color: colors.brown, textDecorationLine: "underline" },

  cardWrap: { width: CARD_WIDTH },
  card: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: "#fff",
    padding: 9,
    flexDirection: "row",
    gap: 11,
    minHeight: 150,
  },
  thumb: { width: "40%", borderRadius: 6, backgroundColor: "#FBF9F6", padding: 4 },
  thumbImage: { width: "100%", height: "100%", resizeMode: "contain" },
  info: { flex: 1, paddingTop: 4 },
  bagName: { fontSize: 13, fontWeight: "700", color: "#151515", marginBottom: 6 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  gradeDot: { width: 7, height: 7, borderRadius: 4 },
  gradeText: { fontSize: 12, color: "#2A2A2A" },
  meta: { fontSize: 11.5, color: "#4A4A4A", marginBottom: 4 },
  actions: { flexDirection: "row", gap: 7, marginTop: 12 },
  btn: { flex: 1, height: 31, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  btnPressed: { transform: [{ scale: 0.96 }] },
  btnPrimary: { backgroundColor: "#111" },
  btnPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  btnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#CFCFCF" },
  btnGhostText: { color: "#222", fontSize: 12 },
  diagLink: { fontSize: 11, color: "#9A9A9A", textAlign: "right", paddingTop: 6 },

  addCard: {
    borderStyle: "dashed",
    borderColor: "#D6D6D6",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  addPressed: { backgroundColor: "#FCFAF7" },
  plus: { fontSize: 34, color: "#B5B5B5", marginBottom: 22 },
  addRule: { width: "78%", height: 1, backgroundColor: "#E3E3E3", marginBottom: 11 },
  addLabel: { fontSize: 12.5, color: "#8A8A8A" },

  dots: { flexDirection: "row", gap: 5, justifyContent: "center", paddingTop: 9 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#D8D8D8" },
  dotActive: { width: 15, borderRadius: 3, backgroundColor: colors.brown },
});
