import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "../../src/components/BrandText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video from "react-native-video";

import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { COLLECTIONS, type Collection } from "../../src/concierge/collections";
import { addPending, listPending, removePending } from "../../src/concierge/wishlist";
import { MOCK_PRODUCTS } from "../../src/register/catalog";
import { colors } from "../../src/theme";

const bagImage = require("../../assets/mcm-bag.png");
const { width: SCREEN_W } = Dimensions.get("window");

/* Concierge — 구매 전 접점.

   홈 검색바를 누르면 여기로 온다. 검색어가 비어 있으면 컬렉션 이야기를, 입력하면 제품
   결과를 보여준다. 찾을 것이 정해지지 않은 사람과 정해진 사람이 같은 자리에서 갈라진다.

   화면 전체가 영상이고 카드는 그 위에 반투명으로 뜬다. 카드가 불투명하면 영상이 그냥
   배경 그림이 되지만, 비쳐 보이면 지금 읽는 이야기와 영상이 한 장면으로 읽힌다.
   그래서 카드 안에 영상을 또 넣지 않는다 — 뒤에서 이미 재생되고 있고, 동시에 붙는
   Video가 늘면 안드로이드 하드웨어 디코더가 모자라 앱이 그대로 죽는다. */
export default function Concierge() {
  const insets = useSafeAreaInsets();
  const bottomPad = useTabBarClearance(16);
  const { q: initialQuery } = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(initialQuery ?? "");
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<Collection | null>(null);
  const [liked, setLiked] = useState<string[]>([]);

  // 관심 등록은 기기에 남아 홈 "내 가방"에 예비 여권으로 선다. 화면에 들어올 때마다 맞춘다.
  useFocusEffect(
    useCallback(() => {
      void listPending().then((items) => setLiked(items.map((item) => item.id)));
    }, []),
  );

  const term = query.trim().toLowerCase();
  const results = useMemo(
    () => (term ? MOCK_PRODUCTS.filter((item) => item.name.toLowerCase().includes(term)) : []),
    [term],
  );

  // 한 장씩 넘어가므로 화면 폭이 곧 한 페이지다.
  const onPage = useRef(({ nativeEvent }: { nativeEvent: { contentOffset: { x: number } } }) => {
    setIndex(Math.round(nativeEvent.contentOffset.x / SCREEN_W));
  }).current;

  const activeCollection = COLLECTIONS[Math.min(index, COLLECTIONS.length - 1)];
  // 이야기 상세가 열려 있으면 그쪽 영상이 배경이 된다. 붙는 Video는 언제나 한 개다.
  const background = opened ?? activeCollection;

  /* 이야기 상세는 오른쪽으로 밀면 닫힌다. ✕만 있으면 읽던 자리에서 손을 크게 옮겨야 하고,
     돌아가는 순간이 뚝 끊겨 보인다. 미는 만큼 따라 움직이다가 놓으면 마저 빠져나간다.
     화면 가장자리에서 시작할 필요가 없게 둔 이유는, 안드로이드가 양쪽 가장자리 스와이프를
     시스템 뒤로가기로 먼저 가져가기 때문이다. */
  const dragX = useRef(new Animated.Value(SCREEN_W)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx > 0) dragX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 90 || gesture.vx > 0.5) closeDetail();
        else Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  /* 상세가 목록 위에 덮이므로, 상세가 다 열린 동안에는 목록을 감춰야 한다. 반투명 베일만
     두면 아래 검색바와 카드가 비쳐 글이 겹쳐 읽힌다. 미는 양에 맞춰 목록이 다시 드러나니
     빠져나가는 느낌은 그대로다. */
  const listOpacity = dragX.interpolate({
    inputRange: [0, SCREEN_W],
    outputRange: [0, 1],
  });

  function openDetail(item: Collection) {
    dragX.setValue(SCREEN_W);
    setOpened(item);
    Animated.timing(dragX, {
      toValue: 0,
      duration: 240,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }

  function closeDetail() {
    Animated.timing(dragX, {
      toValue: SCREEN_W,
      duration: 200,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(() => setOpened(null));
  }

  async function toggleLike(id: string, modelName: string) {
    const next = liked.includes(id) ? await removePending(id) : await addPending({ id, modelName });
    setLiked(next.map((item) => item.id));
  }

  return (
    <View style={styles.screen}>
      <Video
        source={{ uri: background.video }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        repeat
        muted
      />
      <View style={styles.scrim} pointerEvents="none" />

      <Animated.View style={[styles.layer, { opacity: listOpacity }]}>
        <View style={[styles.topRow, { paddingTop: insets.top + 6 }]}>
          <Pressable accessibilityLabel="뒤로가기" hitSlop={12} onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.topTag}>CONCIERGE</Text>
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <View style={styles.lens} />
            <View style={styles.lensHandle} />
            <TextInput
              accessibilityLabel="제품 검색"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="무엇을 찾으세요?"
              placeholderTextColor="#8B8B8B"
              style={styles.searchInput}
              value={query}
            />
            {query.length > 0 ? (
              <Pressable hitSlop={10} onPress={() => setQuery("")}>
                <Text style={styles.clear}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {term ? (
          <ScrollView
            contentContainerStyle={[styles.results, { paddingBottom: bottomPad }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.resultHead}>검색 결과 {results.length}건</Text>
            {results.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>찾는 제품이 없습니다.</Text>
                <Text style={styles.emptySub}>검색어를 지우면 컬렉션 이야기로 돌아갑니다.</Text>
              </View>
            ) : (
              results.map((item) => (
                <View key={item.id} style={styles.resultRow}>
                  <Image source={bagImage} style={styles.resultThumb} />
                  <View style={styles.resultBody}>
                    <Text numberOfLines={1} style={styles.resultName}>
                      {item.name}
                    </Text>
                    <Text style={styles.resultMeta}>
                      {item.color} · {item.price.toLocaleString()}원
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void toggleLike(item.id, item.name)}
                    style={[styles.like, liked.includes(item.id) && styles.likeOn]}
                  >
                    <Text style={[styles.likeText, liked.includes(item.id) && styles.likeTextOn]}>
                      {liked.includes(item.id) ? "♥ 등록됨" : "♡ 관심"}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        ) : (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>컬렉션 이야기</Text>
              <View style={styles.dots}>
                {COLLECTIONS.map((item, i) => (
                  <View key={item.id} style={[styles.dot, i === index && styles.dotOn]} />
                ))}
              </View>
            </View>

            {/* 한 번에 한 장. 페이지 폭이 화면 폭이라 pagingEnabled가 그대로 맞는다.
                  카드 아래는 탭바가 차지하는 만큼만 비워, 카드 끝이 아이콘 바로 위에 닿는다. */}
            <FlatList
              data={COLLECTIONS}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onPage}
              scrollEventThrottle={16}
              style={styles.rail}
              renderItem={({ item }) => (
                <View style={[styles.page, { paddingBottom: bottomPad }]}>
                  <Pressable
                    onPress={() => openDetail(item)}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  >
                    <View style={styles.cardMedia}>
                      <Image source={bagImage} style={styles.cardImage} />
                    </View>
                    <Text style={styles.cardKicker}>{item.kicker}</Text>
                    <Text numberOfLines={1} style={styles.cardTitle}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardCaption}>{item.caption}</Text>
                    <Text style={styles.cardStory}>{item.story}</Text>
                    <View style={styles.cardFacts}>
                      {item.facts.map((fact) => (
                        <Text key={fact} style={styles.cardFact}>
                          {fact}
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.cardMore}>이야기 보기 ›</Text>
                  </Pressable>
                </View>
              )}
            />
          </>
        )}
      </Animated.View>

      {/* 이야기 상세. 새 라우트를 만들지 않고 목록 위에 덮는다. 오른쪽으로 밀면 미는 만큼
          따라 빠져나가면서 아래 목록이 그대로 드러난다 — 돌아가는 순간이 끊기지 않는다. */}
      {opened ? (
        <Animated.View
          style={[styles.detailLayer, { transform: [{ translateX: dragX }] }]}
          {...pan.panHandlers}
        >
          <View style={[styles.topRow, { paddingTop: insets.top + 6 }]}>
            <Pressable accessibilityLabel="닫기" hitSlop={12} onPress={closeDetail}>
              <Text style={styles.back}>✕</Text>
            </Pressable>
            <Text style={styles.topTag}>{opened.kicker}</Text>
          </View>

          <View style={[styles.detailBody, { paddingBottom: bottomPad + 4 }]}>
            <Text style={styles.detailTitle}>{opened.title}</Text>
            <Text style={styles.detailStory}>{opened.story}</Text>
            <View style={styles.factRow}>
              {opened.facts.map((fact) => (
                <Text key={fact} style={styles.fact}>
                  {fact}
                </Text>
              ))}
            </View>
            <View style={styles.detailActions}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/concierge/visit",
                    params: { model: opened.product },
                  })
                }
                style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              >
                <Text style={styles.ghostText}>매장에서 보기</Text>
              </Pressable>
              <Pressable
                onPress={() => void toggleLike(opened.id, opened.product)}
                style={({ pressed }) => [styles.gold, pressed && styles.pressed]}
              >
                <Text style={styles.goldText}>
                  {liked.includes(opened.id) ? "♥ 관심 등록됨" : "♡ 관심 등록"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <BottomTabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,8,4,0.42)" },
  layer: { flex: 1 },
  /* 목록 위에 덮이므로 자기 베일을 갖는다. 투명하면 미는 동안 두 화면이 겹쳐 보인다. */
  detailLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,8,4,0.34)" },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  back: { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 30 },
  topTag: { fontSize: 11, letterSpacing: 2.2, color: "#fff", fontWeight: "600" },

  searchWrap: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  searchBar: {
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.93)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 9,
  },
  lens: { width: 13, height: 13, borderRadius: 8, borderWidth: 2, borderColor: "#7C7C7C" },
  lensHandle: {
    width: 6,
    height: 2,
    backgroundColor: "#7C7C7C",
    transform: [{ rotate: "45deg" }],
    marginLeft: -7,
    marginTop: 7,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#222", padding: 0 },
  clear: { fontSize: 14, color: "#8B8B8B" },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#fff" },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotOn: { width: 16, backgroundColor: colors.goldLight },

  rail: { flex: 1 },
  page: { width: SCREEN_W, paddingHorizontal: 16 },
  /* 반투명 유리판. 뒤 영상이 비쳐야 카드와 배경이 한 장면으로 읽힌다. */
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(18,12,6,0.5)",
    padding: 16,
  },
  cardPressed: { backgroundColor: "rgba(18,12,6,0.62)" },
  cardMedia: {
    flex: 1,
    minHeight: 110,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    overflow: "hidden",
  },
  cardImage: { width: "72%", height: "88%", resizeMode: "contain" },
  cardKicker: { fontSize: 9, letterSpacing: 2, color: colors.goldLight, fontWeight: "700" },
  cardTitle: { fontSize: 19, fontWeight: "700", color: "#fff", marginTop: 6, letterSpacing: -0.2 },
  cardCaption: { fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 4 },
  cardStory: { fontSize: 12, color: "rgba(255,255,255,0.82)", lineHeight: 20, marginTop: 11 },
  cardFacts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  cardFact: {
    borderWidth: 1,
    borderColor: "rgba(226,198,138,0.45)",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9.5,
    color: colors.goldLight,
    overflow: "hidden",
  },
  cardMore: { fontSize: 11.5, color: colors.goldLight, marginTop: "auto", paddingTop: 12 },

  results: { paddingHorizontal: 16 },
  resultHead: { fontSize: 11, color: "rgba(255,255,255,0.6)", paddingVertical: 12 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 11,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(18,12,6,0.5)",
  },
  resultThumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    resizeMode: "contain",
  },
  resultBody: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 12.5, fontWeight: "700", color: "#fff" },
  resultMeta: { fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginTop: 3 },
  like: {
    borderWidth: 1,
    borderColor: "rgba(226,198,138,0.5)",
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  likeOn: { backgroundColor: colors.goldDeep, borderColor: colors.goldDeep },
  likeText: { fontSize: 10.5, color: colors.goldLight },
  likeTextOn: { color: "#fff", fontWeight: "700" },
  empty: { paddingVertical: 40, alignItems: "center", gap: 7 },
  emptyText: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  emptySub: { fontSize: 11.5, color: "rgba(255,255,255,0.55)" },

  detailBody: { marginTop: "auto", paddingHorizontal: 20 },
  detailTitle: { fontSize: 26, fontWeight: "700", color: "#fff", letterSpacing: -0.3 },
  detailStory: { fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 22, marginTop: 11 },
  factRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  fact: {
    borderWidth: 1,
    borderColor: "rgba(226,198,138,0.5)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    color: colors.goldLight,
    overflow: "hidden",
  },
  detailActions: { flexDirection: "row", gap: 9, marginTop: 18 },
  ghost: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: { fontSize: 13, color: "#fff" },
  gold: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.goldLight,
    alignItems: "center",
    justifyContent: "center",
  },
  goldText: { fontSize: 13, color: "#3A2A12", fontWeight: "700" },
  pressed: { opacity: 0.85 },
});
