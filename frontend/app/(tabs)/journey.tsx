import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { productApi, ApiError, type PassportSummary } from "../../src/api/client";
import { Header } from "../../src/components/UI";
import { colors, common, gradeLabel } from "../../src/theme";
const bag = require("../../assets/mcm-bag.png");
export default function JourneyTab() {
  const [passports, setPassports] = useState<PassportSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      /* 실패를 빈 배열로 삼키면 빈 상태 UI가 떠서 통신 오류를 "제품 없음"으로 단정해 보여준다. */ productApi
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.title}>여권</Text>
            <Text style={styles.subtitle}>가방을 선택하면 케어 여정을 볼 수 있습니다</Text>
          </View>
          {passports && <Text style={styles.count}>{passports.length}개</Text>}
        </View>
        {loadError != null ? (
          <View style={styles.center}>
            <Text style={{ color: "#666", fontSize: 13, textAlign: "center" }}>{loadError}</Text>
            <Pressable onPress={() => setReloadKey((k) => k + 1)}>
              <Text
                style={{
                  color: colors.brown,
                  fontSize: 13,
                  marginTop: 12,
                  textDecorationLine: "underline",
                }}
              >
                다시 시도
              </Text>
            </Pressable>
          </View>
        ) : passports === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brown} />
          </View>
        ) : passports.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>등록된 가방이 없습니다</Text>
            <Text style={styles.emptyText}>제품을 등록하면 가방별 여권이 만들어집니다.</Text>
            <Pressable style={styles.register} onPress={() => router.push("/register")}>
              <Text style={styles.registerText}>＋ 제품 등록하기</Text>
            </Pressable>
          </View>
        ) : (
          passports.map((item) => (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() =>
                router.push({ pathname: "/journey/passport", params: { id: String(item.id) } })
              }
            >
              <View style={styles.imageBox}>
                <Image source={bag} style={styles.bag} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.name}>{item.nickname || item.modelName}</Text>
                <Text style={styles.model}>{item.modelName}</Text>
                <Text style={styles.meta}>
                  {item.overallGrade ? `등급 ${gradeLabel(item.overallGrade)}` : "진단 전"} · 함께한
                  지 {item.ownershipDays}일
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 18, paddingBottom: 100, backgroundColor: "#fff", flexGrow: 1 },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: "600", color: "#333" },
  subtitle: { fontSize: 10, color: "#999", marginTop: 6 },
  count: { fontSize: 11, color: colors.brown },
  center: { flex: 1, minHeight: 400, alignItems: "center", justifyContent: "center" },
  empty: {
    minHeight: 420,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d7d0c5",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyTitle: { fontSize: 14, color: "#444" },
  emptyText: { fontSize: 10, color: "#999", marginTop: 8 },
  register: {
    height: 44,
    paddingHorizontal: 24,
    backgroundColor: colors.dark,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  registerText: { fontSize: 11, color: "#fff" },
  card: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: "#e6e1d9",
    borderRadius: 9,
    backgroundColor: "#fff",
    padding: 12,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#6f5534",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  imageBox: {
    width: 92,
    height: 82,
    borderRadius: 7,
    backgroundColor: "#f8f5f0",
    alignItems: "center",
    justifyContent: "center",
  },
  bag: { width: 88, height: 70, resizeMode: "contain" },
  copy: { flex: 1, paddingHorizontal: 13 },
  name: { fontSize: 14, color: "#333", marginBottom: 5 },
  model: { fontSize: 9, color: "#aaa", marginBottom: 6 },
  meta: { fontSize: 10, color: "#777" },
  chevron: { fontSize: 22, color: "#a7957d" },
});
