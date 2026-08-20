import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video from "react-native-video";

import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { COLLECTIONS, type Collection } from "../../src/concierge/collections";
import { MOCK_PRODUCTS } from "../../src/register/catalog";
import { colors } from "../../src/theme";

const { width: SCREEN_W } = Dimensions.get("window");
// 카드가 화면 폭에 딱 맞으면 다음 장이 있다는 게 안 보인다. 살짝 남겨 스크롤을 유도한다.
const CARD_W = Math.round(SCREEN_W * 0.72);
const CARD_GAP = 12;

/* Concierge — 구매 전 접점.

   홈 검색바를 누르면 여기로 온다. 검색어가 비어 있으면 컬렉션 이야기(Concierge)를,
   입력하면 제품 결과를 보여준다. 검색과 별개의 화면을 또 만들지 않은 이유는, 찾을 것이
   정해지지 않은 사람과 정해진 사람이 같은 자리에서 갈라지는 게 자연스럽기 때문이다.

   홈의 검색바는 지금까지 value도 onChangeText도 없는 껍데기였다 — 그 자리를 채운다. */
export default function Concierge() {
  const insets = useSafeAreaInsets();
  const bottomPad = useTabBarClearance(20);
  const { q: initialQuery } = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(initialQuery ?? "");
  const [heroIndex, setHeroIndex] = useState(0);
  const [opened, setOpened] = useState<Collection | null>(null);
  const [liked, setLiked] = useState<string[]>([]);

  const term = query.trim().toLowerCase();
  const results = useMemo(
    () => (term ? MOCK_PRODUCTS.filter((item) => item.name.toLowerCase().includes(term)) : []),
    [term],
  );

  const onCardsScroll = useRef(
    ({ nativeEvent }: { nativeEvent: { contentOffset: { x: number } } }) => {
      setHeroIndex(Math.round(nativeEvent.contentOffset.x / (CARD_W + CARD_GAP)));
    },
  ).current;

  const hero = COLLECTIONS[Math.min(heroIndex, COLLECTIONS.length - 1)];

  function toggleLike(name: string) {
    setLiked((current) =>
      current.includes(name) ? current.filter((x) => x !== name) : [...current, name],
    );
  }

  return (
    <View style={styles.screen}>
      {/* 히어로는 지금 보고 있는 카드를 따라간다. 동시에 붙는 Video는 언제나 한 개다 —
          안드로이드 하드웨어 디코더가 몇 개 안 되기 때문에 여러 장을 붙이면 안 된다. */}
      <View style={styles.hero}>
        <Video
          source={{ uri: hero.video }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          repeat
          muted
        />
        <View style={styles.heroScrim} pointerEvents="none" />

        <View style={[styles.heroTop, { paddingTop: insets.top + 6 }]}>
          <Pressable accessibilityLabel="뒤로가기" hitSlop={12} onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.heroTag}>CONCIERGE</Text>
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

        {term ? null : (
          <View style={styles.heroBody}>
            <Text style={styles.kicker}>{hero.kicker}</Text>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            <Text style={styles.heroCaption}>{hero.caption}</Text>
          </View>
        )}
      </View>

      {term ? (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
          <Text style={styles.resultHead}>검색 결과 {results.length}건</Text>
          {results.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>찾는 제품이 없습니다.</Text>
              <Text style={styles.emptySub}>검색어를 지우면 컬렉션 이야기로 돌아갑니다.</Text>
            </View>
          ) : (
            results.map((item) => (
              <View key={item.id} style={styles.resultRow}>
                <View style={styles.resultThumb} />
                <View style={styles.resultBody}>
                  <Text numberOfLines={1} style={styles.resultName}>
                    {item.name}
                  </Text>
                  <Text style={styles.resultMeta}>
                    {item.color} · {item.price.toLocaleString()}원
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggleLike(item.name)}
                  style={[styles.like, liked.includes(item.name) && styles.likeOn]}
                >
                  <Text style={[styles.likeText, liked.includes(item.name) && styles.likeTextOn]}>
                    {liked.includes(item.name) ? "♥ 등록됨" : "♡ 관심"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <View style={styles.storyArea}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>컬렉션 이야기</Text>
            <Text style={styles.sectionMore}>{COLLECTIONS.length}편</Text>
          </View>

          {/* 카드형 가로 슬라이드. snapToInterval로 카드가 한 장씩 정확히 멈춘다. */}
          <FlatList
            data={COLLECTIONS}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={CARD_W + CARD_GAP}
            snapToAlignment="start"
            onScroll={onCardsScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.rail}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => setOpened(item)}
                style={({ pressed }) => [
                  styles.card,
                  { marginRight: index === COLLECTIONS.length - 1 ? 0 : CARD_GAP },
                  index === heroIndex && styles.cardActive,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.cardThumb} />
                <Text style={styles.cardKicker}>{item.kicker}</Text>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={2} style={styles.cardDesc}>
                  {item.summary}
                </Text>
                <Text style={styles.cardMore}>이야기 보기 ›</Text>
              </Pressable>
            )}
          />

          <View style={styles.pageDots}>
            {COLLECTIONS.map((item, index) => (
              <View key={item.id} style={[styles.pd, index === heroIndex && styles.pdOn]} />
            ))}
          </View>
        </View>
      )}

      {/* 이야기 상세. 새 라우트를 만들지 않고 같은 화면 위에 덮는다 — 여권 상세와 같은 방식이다. */}
      {opened ? (
        <View style={styles.detail}>
          <Video
            source={{ uri: opened.video }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            repeat
            muted
          />
          <View style={styles.detailScrim} pointerEvents="none" />
          <View style={[styles.heroTop, { paddingTop: insets.top + 6 }]}>
            <Pressable accessibilityLabel="닫기" hitSlop={12} onPress={() => setOpened(null)}>
              <Text style={styles.back}>✕</Text>
            </Pressable>
            <Text style={styles.heroTag}>{opened.kicker}</Text>
          </View>

          <View style={[styles.detailBody, { paddingBottom: bottomPad }]}>
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
                onPress={() => router.push("/care/booking")}
                style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              >
                <Text style={styles.ghostText}>매장에서 보기</Text>
              </Pressable>
              <Pressable
                onPress={() => toggleLike(opened.product)}
                style={({ pressed }) => [styles.gold, pressed && styles.pressed]}
              >
                <Text style={styles.goldText}>
                  {liked.includes(opened.product) ? "♥ 관심 등록됨" : "♡ 관심 등록"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <BottomTabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },

  hero: { height: 320, backgroundColor: colors.night },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12,8,4,0.34)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  back: { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 30 },
  heroTag: { fontSize: 11, letterSpacing: 2.2, color: "#fff", fontWeight: "600" },

  searchWrap: { paddingHorizontal: 14, paddingTop: 6 },
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

  heroBody: { marginTop: "auto", padding: 18 },
  kicker: { fontSize: 9.5, letterSpacing: 2.4, color: colors.goldLight, fontWeight: "700" },
  heroTitle: { fontSize: 23, fontWeight: "700", color: "#fff", marginTop: 7, letterSpacing: -0.2 },
  heroCaption: { fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 6 },

  storyArea: { flex: 1, paddingTop: 4 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 13.5, fontWeight: "700", color: "#111" },
  sectionMore: { fontSize: 10.5, color: colors.muted },

  rail: { paddingHorizontal: 16 },
  card: {
    width: CARD_W,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#fff",
  },
  cardActive: { borderColor: colors.goldDeep },
  cardPressed: { backgroundColor: "#FBFAF8" },
  cardThumb: {
    height: 122,
    borderRadius: 8,
    backgroundColor: "#EFE6D8",
    marginBottom: 10,
  },
  cardKicker: { fontSize: 8.5, letterSpacing: 1.8, color: colors.goldDeep, fontWeight: "700" },
  cardTitle: { fontSize: 13.5, fontWeight: "700", color: "#151515", marginTop: 5 },
  cardDesc: { fontSize: 11, color: "#6B6B6B", lineHeight: 17, marginTop: 5 },
  cardMore: { fontSize: 10.5, color: colors.brown, marginTop: 9 },

  pageDots: { flexDirection: "row", gap: 5, justifyContent: "center", paddingTop: 14 },
  pd: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#DCDCDC" },
  pdOn: { width: 15, backgroundColor: colors.brown },

  resultHead: { fontSize: 11, color: colors.muted, paddingHorizontal: 16, paddingTop: 14 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F4F2EE",
  },
  resultThumb: { width: 52, height: 52, borderRadius: 6, backgroundColor: "#EFE6D8" },
  resultBody: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 12.5, fontWeight: "700", color: "#191919" },
  resultMeta: { fontSize: 10.5, color: "#8A8A8A", marginTop: 3 },
  like: {
    borderWidth: 1,
    borderColor: "#E4DCCD",
    backgroundColor: "#FBF7F0",
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  likeOn: { backgroundColor: colors.goldDeep, borderColor: colors.goldDeep },
  likeText: { fontSize: 10.5, color: "#7A6244" },
  likeTextOn: { color: "#fff", fontWeight: "700" },
  empty: { paddingVertical: 40, alignItems: "center", gap: 7 },
  emptyText: { fontSize: 13, color: "#666" },
  emptySub: { fontSize: 11.5, color: colors.muted },

  /* 탭바(elevation 12)보다 낮게 둔다. 이야기 상세는 앱 크롬 아래에 깔려야 탭바가 살아 있고,
     CTA는 아래 detailBody의 여백으로 탭바를 피한다. 안드로이드는 zIndex보다 elevation이
     우선이라 둘을 같이 줘야 iOS/안드로이드 순서가 어긋나지 않는다. */
  detail: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 8,
    backgroundColor: colors.night,
  },
  detailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12,8,4,0.52)",
  },
  detailBody: { marginTop: "auto", paddingHorizontal: 20 },
  detailTitle: { fontSize: 26, fontWeight: "700", color: "#fff", letterSpacing: -0.3 },
  detailStory: {
    fontSize: 12.5,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 22,
    marginTop: 11,
  },
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
