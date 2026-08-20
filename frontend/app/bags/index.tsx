import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";
import { AppButton, Header } from "../../src/components/UI";
import { productApi, ApiError, type PassportSummary } from "../../src/api/client";
import { colors, common, gradeLabel } from "../../src/theme";
const bag = require("../../assets/mcm-bag.png");
function EmptyPassportArtwork() {
  return (
    <View style={styles.art}>
      <View style={styles.backPaper}>
        <Text style={styles.paperLines}>
          CARE{`\n`}PASSPORT{`\n`}· · · ·
        </Text>
      </View>
      <View style={styles.book}>
        <View style={styles.spine} />
        <View style={styles.leftPage}>
          <Text style={styles.mcm}>MCM</Text>
          <Text style={styles.passport}>CARE PASSPORT</Text>
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoMark}>◇</Text>
          </View>
          <View style={styles.goldLine} />
          <View style={styles.goldLineShort} />
        </View>
        <View style={styles.rightPage}>
          <Text style={styles.pageTitle}>CARE JOURNEY</Text>
          <View style={styles.stampRow}>
            {["M", "C", "M"].map((item, index) => (
              <View key={`${item}-${index}`} style={styles.miniStamp}>
                <Text style={styles.miniStampText}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeDots}>
            {[0, 1, 2, 3].map((item) => (
              <View key={item} style={styles.routeDot} />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.leatherTag}>
        <Text style={styles.tagText}>MCM</Text>
      </View>
      <View style={styles.coin}>
        <Text style={styles.coinText}>M</Text>
      </View>
    </View>
  );
}
export default function Bags() {
  const [bags, setBags] = useState<PassportSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      /* 실패를 빈 배열로 삼키면 빈 상태 UI가 떠서 통신 오류를 "제품 없음"으로 단정해 보여준다. */ productApi
        .list()
        .then((res) => {
          if (active) {
            setBags(res.content);
            setLoadError(null);
          }
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
  return (
    <View style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>내 가방</Text>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brown} />
          </View>
        ) : loadError != null ? (
          <View style={styles.loading}>
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
        ) : bags && bags.length > 0 ? (
          <View style={styles.list}>
            {bags.map((item) => (
              <Pressable
                key={item.id}
                style={styles.bagCard}
                onPress={() =>
                  router.push({ pathname: "/bags/detail", params: { id: String(item.id) } })
                }
              >
                <Image source={bag} style={styles.bagImage} />
                <Text style={styles.bagName}>{item.nickname || item.modelName}</Text>
                <Text style={common.muted}>
                  {item.overallGrade ? `등급 ${gradeLabel(item.overallGrade)}` : "진단 전"} ·{" "}
                  {item.ownershipDays}일
                </Text>
              </Pressable>
            ))}
            <AppButton title="＋ 제품 등록하기" onPress={() => router.push("/register")} />
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <EmptyPassportArtwork />
            <Text style={styles.emptyTitle}>아직 등록된 제품이 없습니다</Text>
            <Text style={styles.emptyDescription}>
              가방 안쪽 황동 플레이트의 고유번호로{`\n`}첫 여권을 시작할 수 있습니다
            </Text>
            <Pressable style={styles.registerButton} onPress={() => router.push("/register")}>
              <Text style={styles.registerText}>＋ 제품 등록하기</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 18, paddingBottom: 95, backgroundColor: "#fff", flexGrow: 1 },
  title: { fontSize: 16, color: "#444", marginBottom: 10 },
  loading: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center" },
  list: { gap: 12 },
  bagCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#e4e4e4",
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  bagImage: { width: 220, height: 150, resizeMode: "contain" },
  bagName: { fontSize: 14, color: "#333", marginTop: 5 },
  emptyCard: {
    flex: 1,
    minHeight: 535,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D0C9",
    borderRadius: 12,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 28,
  },
  emptyTitle: { fontSize: 13, color: "#3f3f3f", marginTop: 24 },
  emptyDescription: {
    fontSize: 10,
    color: "#aaa",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 35,
  },
  registerButton: {
    width: 160,
    height: 48,
    borderRadius: 5,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  registerText: { fontSize: 12, color: "#fff" },
  art: {
    width: 230,
    height: 205,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  backPaper: {
    position: "absolute",
    left: 25,
    top: 12,
    width: 80,
    height: 118,
    backgroundColor: "#EDE0C9",
    borderWidth: 1,
    borderColor: "#D3BE9F",
    transform: [{ rotate: "-12deg" }],
    padding: 12,
  },
  paperLines: { fontSize: 8, lineHeight: 16, color: "#8D7655" },
  book: {
    width: 175,
    height: 145,
    backgroundColor: "#F7EEDC",
    borderWidth: 2,
    borderColor: "#CDBB9E",
    borderRadius: 3,
    flexDirection: "row",
    shadowColor: "#5A4630",
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 5,
  },
  spine: {
    position: "absolute",
    left: 85,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: "#BDA379",
    zIndex: 3,
  },
  leftPage: { width: 87, padding: 10, alignItems: "center" },
  rightPage: { width: 84, padding: 9, alignItems: "center" },
  mcm: { fontSize: 12, fontWeight: "700", color: "#765B39", marginTop: 3 },
  passport: { fontSize: 5, letterSpacing: 1, color: "#987B55", marginTop: 2 },
  photoPlaceholder: {
    width: 42,
    height: 47,
    borderWidth: 1,
    borderColor: "#B9A27E",
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  photoMark: { fontSize: 20, color: "#B2966E" },
  goldLine: { height: 1, width: 47, backgroundColor: "#C8B18D", marginTop: 8 },
  goldLineShort: { height: 1, width: 32, backgroundColor: "#C8B18D", marginTop: 5 },
  pageTitle: { fontSize: 7, fontWeight: "700", color: "#755C3A", marginTop: 8 },
  stampRow: { flexDirection: "row", gap: 5, marginTop: 15 },
  miniStamp: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#AA8E65",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  miniStampText: { fontSize: 5, color: "#8C704B" },
  routeLine: {
    width: 58,
    height: 32,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#BFA77E",
    borderBottomLeftRadius: 24,
    marginTop: 10,
    transform: [{ rotate: "-8deg" }],
  },
  routeDots: { position: "absolute", bottom: 15, flexDirection: "row", gap: 7 },
  routeDot: { width: 4, height: 4, borderRadius: 2, borderWidth: 1, borderColor: "#9A7A51" },
  leatherTag: {
    position: "absolute",
    left: 12,
    bottom: 7,
    width: 42,
    height: 54,
    backgroundColor: "#8A542B",
    borderWidth: 2,
    borderColor: "#693A1D",
    borderRadius: 4,
    transform: [{ rotate: "9deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: { fontSize: 7, color: "#E8C99D" },
  coin: {
    position: "absolute",
    right: 8,
    bottom: 11,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#B18A50",
    borderWidth: 3,
    borderColor: "#7C5A34",
    alignItems: "center",
    justifyContent: "center",
  },
  coinText: { fontSize: 13, color: "#F5E2BC", fontWeight: "700" },
});
