import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ApiError,
  journeyApi,
  productApi,
  type PassportDetail,
  type TimelineItem,
} from "../../src/api/client";
import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { Stamp } from "../../src/components/Stamp";
import { Header } from "../../src/components/UI";
import { noteFor, stampDate, titleFor, typeLabel } from "../../src/journey/timeline";
import { colors, gradeColor } from "../../src/theme";

const bagImage = require("../../assets/mcm-bag.png");

const STAMP_SIZE = 86;
const NODE_GAP = 126;
const MAP_TOP = 40;

/* 스탬프를 좌우로 굽이치는 길 위에 놓는다. sin 곡선이라 개수가 늘어도 규칙이 유지된다.
   x는 맵 너비에 대한 비율, y는 픽셀. */
function nodePos(index: number, width: number) {
  return {
    x: (0.5 + Math.sin(index * 0.92) * 0.26) * width,
    y: MAP_TOP + index * NODE_GAP,
  };
}

export default function Passport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomPad = useTabBarClearance(20);
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [grade, setGrade] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // 날아가는 도장 + 펼쳐지는 기록
  const fly = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flyScale = useRef(new Animated.Value(1)).current;
  const flyOn = useRef(new Animated.Value(0)).current;
  const unfurl = useRef(new Animated.Value(0)).current;
  const [flyFrom, setFlyFrom] = useState({ x: 0, y: 0 });
  const [flyType, setFlyType] = useState("기타");
  const landTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mapWidth = width - 40;

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      setLoading(true);
      Promise.all([productApi.detail(id), journeyApi.list(id), productApi.list(0, 100)])
        .then(([detail, list, page]) => {
          if (!active) return;
          setPassport(detail);
          // 백엔드 타임라인은 오래된 순으로 온다 — 길도 그 순서대로 이어진다.
          setItems([...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)));
          setGrade(page.content.find((p) => String(p.id) === String(id))?.overallGrade ?? null);
          setError(null);
        })
        .catch((reason) => {
          if (active)
            setError(reason instanceof ApiError ? reason.message : "여권을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );

  // 스탬프를 누르면 그 자리에서 도장이 날아와 기록이 깃발처럼 펼쳐진다.
  function openStamp(index: number) {
    const item = items[index];
    if (!item) return;
    const pos = nodePos(index, mapWidth);
    setFlyType(typeLabel(item));
    setFlyFrom({ x: pos.x - STAMP_SIZE / 2, y: pos.y - STAMP_SIZE / 2 });
    fly.setValue({ x: 0, y: 0 });
    flyScale.setValue(1);
    flyOn.setValue(1);
    unfurl.setValue(0);
    setOpenIndex(index);

    Animated.parallel([
      Animated.timing(fly, {
        toValue: { x: 20 - (pos.x - STAMP_SIZE / 2), y: -pos.y + 120 },
        duration: 520,
        easing: Easing.bezier(0.3, 0.8, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(flyScale, {
        toValue: 62 / STAMP_SIZE,
        duration: 520,
        easing: Easing.bezier(0.3, 0.8, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();

    /* 애니메이션 콜백에만 기대면 화면이 백그라운드로 갔다 오는 등으로 콜백이 안 올 때
       도장이 화면에 남고 기록은 투명한 채로 멈춘다. 시간으로도 반드시 마무리한다. */
    clearTimeout(landTimer.current);
    landTimer.current = setTimeout(() => {
      flyOn.setValue(0);
      Animated.timing(unfurl, {
        toValue: 1,
        duration: 620,
        easing: Easing.bezier(0.22, 0.9, 0.3, 1),
        useNativeDriver: true,
      }).start();
      // 애니메이션이 어떤 이유로든 끝나지 않아도 내용은 보여야 한다.
      setTimeout(() => unfurl.setValue(1), 900);
    }, 540);
  }

  function closeStamp() {
    Animated.timing(unfurl, {
      toValue: 0,
      duration: 260,
      easing: Easing.bezier(0.6, 0, 0.8, 0.3),
      useNativeDriver: true,
    }).start(() => setOpenIndex(null));
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header title="여권" back />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
        <BottomTabBar active="journey" />
      </View>
    );
  }

  if (error != null || passport == null) {
    return (
      <View style={styles.screen}>
        <Header title="여권" back />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? "여권을 불러오지 못했습니다."}</Text>
        </View>
        <BottomTabBar active="journey" />
      </View>
    );
  }

  const mapHeight = nodePos(Math.max(items.length - 1, 0), mapWidth).y + 110;
  const opened = openIndex != null ? items[openIndex] : null;

  return (
    <View style={styles.screen}>
      <Header title="여권" back />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
        <View style={styles.hero}>
          <Image source={bagImage} style={styles.heroImage} />
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{passport.nickname || passport.modelName}</Text>
          {grade ? (
            <Text style={[styles.gradeBadge, { backgroundColor: gradeColor(grade) }]}>
              등급 {grade}
            </Text>
          ) : null}
        </View>
        <Text style={styles.meta}>{passport.serialNumber}</Text>
        <Text style={styles.meta}>{stampDate(passport.purchaseDate)} 개시</Text>
        <View style={styles.rule} />
        <Text style={styles.days}>
          <Text style={styles.diamond}>◆ </Text>
          {items.length}개의 여정 스탬프
        </Text>

        {/* 3D 맵: 원근을 준 길 위에 도장이 놓인다. */}
        <View style={[styles.mapWrap, { height: mapHeight }]}>
          <View style={[styles.map, { width: mapWidth, height: mapHeight }]}>
            {items.slice(0, -1).map((_, index) => {
              const a = nodePos(index, mapWidth);
              const b = nodePos(index + 1, mapWidth);
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              return (
                <View
                  key={`path-${index}`}
                  style={[
                    styles.path,
                    {
                      width: length,
                      left: a.x,
                      top: a.y - 5,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}

            {items.map((item, index) => {
              const pos = nodePos(index, mapWidth);
              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`${index + 1}번째 여권 스탬프 열기`}
                  onPress={() => openStamp(index)}
                  style={({ pressed }) => [
                    styles.node,
                    {
                      left: pos.x - STAMP_SIZE / 2,
                      top: pos.y - STAMP_SIZE / 2,
                      transform: [{ translateY: pressed ? 3 : 0 }],
                    },
                  ]}
                >
                  <Stamp type={typeLabel(item)} size={STAMP_SIZE} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push({ pathname: "/journey/transfer", params: { id } })}
            style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
          >
            <Text style={styles.outlineText}>여권 승계</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: "/journey/add", params: { id } })}
            style={({ pressed }) => [styles.filled, pressed && styles.pressed]}
          >
            <Text style={styles.filledText}>＋ 기록 추가</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 날아가는 도장 (착지하면 사라지고 상세가 뜬다) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flying,
          {
            left: flyFrom.x + 20,
            top: flyFrom.y + 250,
            opacity: flyOn,
            transform: [{ translateX: fly.x }, { translateY: fly.y }, { scale: flyScale }],
          },
        ]}
      >
        <Stamp type={flyType} size={STAMP_SIZE} />
      </Animated.View>

      {opened != null ? (
        <View style={styles.detailLayer}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingTop: insets.top + 16, paddingBottom: bottomPad },
            ]}
          >
            {/* 어느 가방의 기록인지 상세에서도 그대로 보인다. */}
            <View style={styles.hero}>
              <Image source={bagImage} style={styles.heroImage} />
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{passport.nickname || passport.modelName}</Text>
              {grade ? (
                <Text style={[styles.gradeBadge, { backgroundColor: gradeColor(grade) }]}>
                  등급 {grade}
                </Text>
              ) : null}
            </View>
            <Text style={styles.meta}>{passport.serialNumber}</Text>
            <View style={styles.rule} />

            <View style={styles.detailHead}>
              <Stamp type={typeLabel(opened)} size={62} />
              <Animated.View
                style={[
                  styles.titlePill,
                  {
                    opacity: unfurl,
                    transform: [
                      {
                        scaleX: unfurl.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.detailDate}>{stampDate(opened.occurredAt)}</Text>
                <Text style={styles.detailTitle}>{titleFor(opened)}</Text>
              </Animated.View>
            </View>

            <Animated.View style={[styles.noteLine, { transform: [{ scaleY: unfurl }] }]} />
            <Animated.View
              style={[
                styles.note,
                {
                  opacity: unfurl,
                  transform: [{ scaleY: unfurl }],
                },
              ]}
            >
              <Text style={styles.noteText}>{noteFor(opened)}</Text>
            </Animated.View>

            <View style={styles.actions}>
              <Pressable
                onPress={closeStamp}
                style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
              >
                <Text style={styles.outlineText}>여권으로 돌아가기</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <BottomTabBar active="journey" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 13, color: "#666" },
  content: { padding: 20 },

  hero: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D0C9",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    alignItems: "center",
    backgroundColor: "#FBFAF8",
  },
  heroImage: { width: "66%", height: 150, resizeMode: "contain" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 6 },
  name: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111" },
  gradeBadge: {
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  meta: { fontSize: 11.5, color: "#9A9A9A", marginBottom: 3 },
  rule: { height: 1, backgroundColor: "#E6E1D8", marginVertical: 14 },
  days: { fontSize: 13, color: "#2A2A2A", marginBottom: 6 },
  diamond: { color: colors.gold, fontSize: 9 },

  mapWrap: { alignItems: "center", marginTop: 10 },
  map: { transform: [{ perspective: 1000 }, { rotateX: "17deg" }] },
  path: {
    position: "absolute",
    height: 10,
    backgroundColor: "#EDE7DC",
    borderRadius: 3,
    transformOrigin: "left center",
  },
  node: { position: "absolute" },

  actions: { flexDirection: "row", gap: 10, marginTop: 26 },
  outline: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  outlineText: { fontSize: 14, color: "#222" },
  filled: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
  },
  filledText: { fontSize: 14, color: "#fff", fontWeight: "500" },
  pressed: { transform: [{ scale: 0.98 }] },

  flying: { position: "absolute", zIndex: 30 },
  detailLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: "#fff" },
  detailHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  titlePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E0D6C4",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    transformOrigin: "left center",
  },
  detailDate: { fontSize: 9.5, color: "#B0A594" },
  detailTitle: { fontSize: 13, color: "#1A1A1A", fontWeight: "600" },
  noteLine: {
    width: 1,
    height: 26,
    backgroundColor: colors.gold,
    marginLeft: 30,
    transformOrigin: "top center",
  },
  note: {
    marginLeft: 20,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 8,
    padding: 14,
    minHeight: 180,
    transformOrigin: "top center",
  },
  noteText: { fontSize: 12.5, color: "#3A3A3A", lineHeight: 26 },
});
