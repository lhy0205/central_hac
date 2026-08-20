import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../../src/components/BrandText";

import { ApiError, productApi, type PassportSummary } from "../../src/api/client";
import { useTabBarClearance } from "../../src/components/BottomTabBar";
import { Header } from "../../src/components/UI";
import { colors, gradeLabel } from "../../src/theme";

const bagImage = require("../../assets/mcm-bag.png");
const CARD_WIDTH = Dimensions.get("window").width - 40;

export default function JourneyTab() {
  const bottomPad = useTabBarClearance(20);
  const [passports, setPassports] = useState<PassportSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [index, setIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      productApi
        .list(0, 100)
        .then((page) => {
          if (active) {
            setPassports(page.content);
            setLoadError(null);
          }
        })
        .catch((err) => {
          if (active)
            setLoadError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
        });
      return () => {
        active = false;
      };
    }, [reloadKey]),
  );

  return (
    <View style={styles.screen}>
      <Header />
      <View style={[styles.body, { paddingBottom: bottomPad }]}>
        <Text style={styles.heading}>내 가방</Text>

        {loadError != null ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{loadError}</Text>
            <Pressable onPress={() => setReloadKey((key) => key + 1)}>
              <Text style={styles.retry}>다시 시도</Text>
            </Pressable>
          </View>
        ) : passports == null ? (
          <View style={styles.state}>
            <ActivityIndicator />
          </View>
        ) : passports.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>등록된 가방이 없습니다</Text>
            <Text style={styles.emptyText}>제품을 등록하면 가방별 여권이 만들어집니다.</Text>
            <Pressable style={styles.register} onPress={() => router.push("/register")}>
              <Text style={styles.registerText}>＋ 제품 등록하기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FlatList
              data={passports}
              keyExtractor={(item) => String(item.id)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) =>
                setIndex(
                  Math.round(
                    event.nativeEvent.contentOffset.x /
                      Math.max(1, event.nativeEvent.layoutMeasurement.width),
                  ),
                )
              }
              renderItem={({ item }) => (
                <View style={styles.cardWrap}>
                  <View style={styles.card}>
                    <Image source={bagImage} style={styles.cardImage} />
                    <Text style={styles.cardName}>{item.nickname || item.modelName}</Text>
                    <Text style={styles.cardMeta}>
                      {item.overallGrade ? `등급 ${gradeLabel(item.overallGrade)}` : "진단 전"} ·{" "}
                      {item.ownershipDays}일
                    </Text>
                    <Pressable
                      accessibilityLabel="여권 보기"
                      onPress={() =>
                        router.push({
                          pathname: "/journey/passport",
                          params: { id: String(item.id) },
                        })
                      }
                      style={({ pressed }) => [styles.open, pressed && styles.openPressed]}
                    >
                      <Text style={styles.openText}>여권 보기</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
            {passports.length > 1 ? (
              <View style={styles.dots}>
                {passports.map((_, dot) => (
                  <View key={dot} style={[styles.dot, dot === index && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  heading: { fontSize: 16, fontWeight: "800", color: "#111", marginBottom: 14 },
  state: { paddingTop: 60, alignItems: "center", gap: 10 },
  stateText: { fontSize: 13, color: "#666", textAlign: "center" },
  retry: { fontSize: 13, color: colors.brown, textDecorationLine: "underline" },

  cardWrap: { width: CARD_WIDTH },
  card: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D0C9",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: "center",
  },
  cardImage: { width: "88%", height: 250, resizeMode: "contain" },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    marginTop: 14,
    marginBottom: 6,
    textAlign: "center",
  },
  cardMeta: { fontSize: 11.5, color: "#9A9A9A", marginBottom: 20 },
  open: {
    height: 36,
    paddingHorizontal: 26,
    borderRadius: 6,
    backgroundColor: "#EFEFEF",
    alignItems: "center",
    justifyContent: "center",
  },
  openPressed: { backgroundColor: "#E4DDD0", transform: [{ scale: 0.96 }] },
  openText: { fontSize: 13, color: "#7A7A7A" },

  dots: { flexDirection: "row", gap: 5, justifyContent: "center", paddingTop: 14 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#D8D8D8" },
  dotActive: { width: 15, borderRadius: 3, backgroundColor: colors.brown },

  emptyCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D0C9",
    borderRadius: 12,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: { fontSize: 14, color: "#3F3F3F" },
  emptyText: { fontSize: 11.5, color: "#AAA", textAlign: "center" },
  register: {
    marginTop: 12,
    width: 160,
    height: 48,
    borderRadius: 5,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  registerText: { fontSize: 12, color: "#fff" },
});
