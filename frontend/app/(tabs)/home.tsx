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
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { Text } from "../../src/components/BrandText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video from "react-native-video";

import { ApiError, productApi, type PassportSummary } from "../../src/api/client";
import { useTabBarClearance } from "../../src/components/BottomTabBar";
import { listPending, type PendingPassport } from "../../src/concierge/wishlist";
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
  // 카드가 탭바 아이콘에 바짝 붙지 않도록 한 뼘 띄운다.
  const dockBottom = useTabBarClearance(30);
  const { setTabBarHidden } = useChrome();
  const [bags, setBags] = useState<BagCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [feedFocused, setFeedFocused] = useState(true);
  // Concierge에서 관심 등록한 제품. 아직 산 게 아니라 서버 여권이 없으므로 기기에서 읽는다.
  const [pending, setPending] = useState<PendingPassport[]>([]);
  /* 슬라이드 높이를 Dimensions의 window로 잡으면 안 된다. edge-to-edge라 실제 뷰포트는
     내비게이션 바까지 덮는데 window는 그걸 뺀 값이라, 한 장이 화면보다 짧아져 넘길 때
     아래에 검은 띠가 생기고 페이징도 어긋난다. 리스트가 차지한 높이를 직접 재서 쓴다. */
  const [feedHeight, setFeedHeight] = useState(SCREEN_H);
  // 광고 문구가 "내 가방" 카드 뒤에 깔리지 않도록, 카드가 실제로 차지한 높이만큼 띄운다.
  const [dockHeight, setDockHeight] = useState(0);
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

  // 홈은 탭이라 다른 화면으로 가도 마운트된 채로 남는다. 그동안 배경 영상이 디코더를 계속
  // 붙들고 있으면, AR이나 등록 스캔처럼 카메라·영상을 또 여는 화면에서 한도를 넘겨 앱이
  // 통째로 죽는다. 포커스를 잃으면 영상을 떼고, 돌아오면 다시 붙인다.
  useFocusEffect(
    useCallback(() => {
      setFeedFocused(true);
      return () => setFeedFocused(false);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      void listPending().then(setPending);
    }, []),
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
  // 24px을 넘겨야 사라지면 카드가 잠깐 버티다 없어져 걸리적거린다. 끌기 시작하면 바로 치운다.
  const onFeedDragStart = () => {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    setChromeHidden(true);
    setTabBarHidden(true);
  };

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

  /* 카드 한 장이 세 종류다 — 실제 여권, 아직 안 산 예비 여권, 맨 끝의 제품 등록.
     구별을 위해 종류를 붙여 한 배열로 만든다. */
  type DockCard =
    { kind: "bag"; bag: BagCard } | { kind: "pending"; item: PendingPassport } | { kind: "add" };
  const cards: DockCard[] = [
    ...(bags ?? []).map((bag) => ({ kind: "bag" as const, bag })),
    ...pending.map((item) => ({ kind: "pending" as const, item })),
  ];
  const dockCards: DockCard[] = [...cards, { kind: "add" }];

  return (
    <View style={styles.screen}>
      <FlatList
        data={AD_SLIDES}
        keyExtractor={(item) => item.key}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onScroll={onFeedScroll}
        onScrollBeginDrag={onFeedDragStart}
        scrollEventThrottle={16}
        onLayout={(event) => setFeedHeight(event.nativeEvent.layout.height)}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        /* 높이가 모든 장에서 같으니 미리 알려준다 — FlatList가 위치를 재지 않아 페이징이
           어긋나지 않고, 다음 장을 늦게 그려 검은 띠가 뜨는 일도 없다. */
        getItemLayout={(_, index) => ({
          length: feedHeight,
          offset: feedHeight * index,
          index,
        })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item, index }) => (
          <View style={[styles.slide, { height: feedHeight }]}>
            {/* 안드로이드가 동시에 열 수 있는 하드웨어 비디오 디코더는 2~4개뿐이다. 슬라이드
                4개의 Video를 한꺼번에 붙여 두면 MediaCodec이 바닥나 네이티브에서 앱이 그대로
                죽는다(paused여도 디코더는 잡고 있다). 지금 슬라이드와 바로 이웃만 붙인다. */}
            {feedFocused && Math.abs(index - activeSlide) <= 1 ? (
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
            <View
              style={[
                styles.adTag,
                {
                  /* 카드가 사라지면 화면 아래가 통째로 비는데, 문구를 바닥에 붙여 두면
                     고개를 숙여야 읽힌다. 아래에서 4분의 1쯤 되는 자리로 올려 눈높이에 맞춘다. */
                  bottom: chromeHidden
                    ? Math.round(feedHeight * 0.26)
                    : dockBottom + dockHeight + 14,
                },
              ]}
              pointerEvents="none"
            >
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
            Care<Text style={styles.logoSub}>Passport</Text>
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
        {/* 검색바는 여태 value도 onChangeText도 없는 껍데기였다. 누르면 Concierge로 보낸다 —
            거기서 검색어가 비면 컬렉션 이야기를, 입력하면 제품 결과를 보여준다. 여기서 바로
            타이핑을 받지 않는 이유는, 홈 배경이 세로 페이징이라 키보드가 올라오면 레이아웃이
            흔들리기 때문이다. */}
        <View style={styles.searchWrap}>
          <Pressable
            accessibilityLabel="제품 검색"
            accessibilityRole="search"
            onPress={() => router.push("/concierge")}
            style={({ pressed }) => [styles.searchBar, pressed && styles.searchPressed]}
          >
            <View style={styles.searchLens} />
            <View style={styles.searchHandle} />
            <Text style={styles.searchPlaceholder}>제품 검색 & Concierge</Text>
            <View style={styles.mic}>
              <View style={styles.micHead} />
              <View style={styles.micArc} />
            </View>
          </Pressable>
        </View>
      </View>

      {/* 탭바가 실제로 차지하는 높이(내비게이션 바 포함)만큼 띄워야 카드가 안 가린다. */}
      {!chromeHidden && (
        <View style={[styles.dock, { bottom: dockBottom }]} pointerEvents="box-none">
          <View
            onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
            style={styles.dockInner}
          >
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
                data={dockCards}
                keyExtractor={(item, index) =>
                  item.kind === "bag"
                    ? `bag-${item.bag.id}`
                    : item.kind === "pending"
                      ? `pending-${item.item.id}`
                      : `add-${index}`
                }
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
                  item.kind === "bag" ? (
                    <BagCardView bag={item.bag} />
                  ) : item.kind === "pending" ? (
                    <PendingCardView item={item.item} />
                  ) : (
                    <RegisterCardView />
                  )
                }
              />
            )}

            {cards.length > 0 && (
              <View style={styles.dots}>
                {dockCards.map((_, index) => (
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

/* 예비 여권 — Concierge에서 관심만 등록한 제품. 아직 실물이 없어 등급도 보유일수도 없다.
   점선 테두리로 "아직 여권이 아니다"를 드러내고, 시리얼을 스캔하면 진짜 여권이 된다. */
function PendingCardView({ item }: { item: PendingPassport }) {
  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, styles.pendingCard]}>
        <View style={[styles.thumb, styles.pendingThumb]}>
          <Text style={styles.pendingMark}>◇</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.pendingTag}>예비 여권</Text>
          <Text numberOfLines={2} style={styles.bagName}>
            {item.modelName}
          </Text>
          <Text style={styles.pendingNote}>관심 등록 · {formatDate(item.addedAt)}</Text>
          <Text style={styles.pendingNote}>
            구매 후 시리얼을 스캔하면 이 여권이 그대로 이어집니다
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/register",
                  params: { step: "scan", model: item.modelName, pending: item.id },
                })
              }
              style={({ pressed }) => [styles.btn, styles.btnGold, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnPrimaryText}>시리얼 스캔</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/concierge/visit",
                  params: { model: item.modelName },
                })
              }
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnGhostText}>매장 방문</Text>
            </Pressable>
          </View>
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
  logoSub: { fontSize: 15, fontWeight: "400", color: "rgba(255,255,255,0.72)" },
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
  searchPlaceholder: { flex: 1, fontSize: 15, color: "#8B8B8B" },
  searchPressed: { backgroundColor: "rgba(255,255,255,0.78)" },
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
    minHeight: 128,
  },
  thumb: { width: "40%", borderRadius: 6, backgroundColor: "#FBF9F6", padding: 4 },
  thumbImage: { width: "100%", height: "100%", resizeMode: "contain" },
  info: { flex: 1, paddingTop: 4 },
  bagName: { fontSize: 13, fontWeight: "700", color: "#151515", marginBottom: 4 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  gradeDot: { width: 7, height: 7, borderRadius: 4 },
  gradeText: { fontSize: 12, color: "#2A2A2A" },
  meta: { fontSize: 11.5, color: "#4A4A4A", marginBottom: 2 },
  actions: { flexDirection: "row", gap: 7, marginTop: 10 },
  btn: { flex: 1, height: 31, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  btnPressed: { transform: [{ scale: 0.96 }] },
  btnPrimary: { backgroundColor: "#111" },
  btnPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  btnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#CFCFCF" },
  btnGhostText: { color: "#222", fontSize: 12 },
  diagLink: { fontSize: 11, color: "#9A9A9A", textAlign: "right", paddingTop: 6 },

  pendingCard: {
    borderStyle: "dashed",
    borderColor: "#C7BBA4",
    backgroundColor: colors.stampPaper,
  },
  pendingThumb: { backgroundColor: "#F3EDE2", alignItems: "center", justifyContent: "center" },
  pendingMark: { fontSize: 30, color: "#C4B69C" },
  pendingTag: {
    alignSelf: "flex-start",
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: colors.goldDeep,
    borderWidth: 1,
    borderColor: "#E4DCCD",
    backgroundColor: "#FBF7F0",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: "hidden",
    marginBottom: 7,
  },
  pendingNote: { fontSize: 10.5, color: "#8A7B60", lineHeight: 16, marginTop: 2 },
  btnGold: { backgroundColor: colors.goldDeep },

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
