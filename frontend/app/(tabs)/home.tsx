import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Header } from "../../src/components/UI";
import { productApi, ApiError, type PassportSummary } from "../../src/api/client";
import { common, colors, gradeLabel } from "../../src/theme";
const bag = require("../../assets/mcm-bag.png");
const REDIAGNOSE_THRESHOLD_DAYS = 90;
function EmptyPassportArtwork() {
  return (
    <View style={st.emptyArt}>
      <View style={st.backPaper}>
        <Text style={st.paperText}>
          MCM{`\n`}CARE{`\n`}· · ·
        </Text>
      </View>
      <View style={st.openBook}>
        <View style={st.bookSpine} />
        <View style={st.bookPage}>
          <Text style={st.bookLogo}>MCM</Text>
          <Text style={st.bookCaption}>NOMAD PASSPORT</Text>
          <View style={st.bookPhoto}>
            <Text style={st.bookPhotoMark}>◇</Text>
          </View>
          <View style={st.bookLine} />
          <View style={st.bookLineShort} />
        </View>
        <View style={st.bookPage}>
          <Text style={st.journeyTitle}>CARE JOURNEY</Text>
          <View style={st.miniStamps}>
            {[0, 1, 2].map((index) => (
              <View key={index} style={st.miniStamp}>
                <Text style={st.miniStampText}>M</Text>
              </View>
            ))}
          </View>
          <View style={st.route} />
          <View style={st.routeDots}>
            {[0, 1, 2, 3].map((index) => (
              <View key={index} style={st.routeDot} />
            ))}
          </View>
        </View>
      </View>
      <View style={st.tag}>
        <Text style={st.tagText}>MCM</Text>
      </View>
      <View style={st.coin}>
        <Text style={st.coinText}>M</Text>
      </View>
    </View>
  );
}
export default function Home() {
  const [bags, setBags] = useState<PassportSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        BackHandler.exitApp();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      // 실패를 빈 배열로 삼키면 "아직 등록된 제품이 없습니다" 빈 상태가 떠서, 통신 오류를
      // 사용자 데이터에 대한 단정으로 바꿔 보여주게 된다. 오류와 빈 목록을 구분한다.
      productApi
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
  if (loading)
    return (
      <>
        <Header />
        <View style={[common.content, { alignItems: "center", paddingTop: 60 }]}>
          <ActivityIndicator />
        </View>
      </>
    );
  if (loadError != null)
    return (
      <>
        <Header />
        <View style={[common.content, { alignItems: "center", paddingTop: 60, gap: 12 }]}>
          <Text style={{ color: "#666", fontSize: 13, textAlign: "center" }}>{loadError}</Text>
          <Pressable onPress={() => setReloadKey((k) => k + 1)}>
            <Text style={{ color: colors.brown, fontSize: 13, textDecorationLine: "underline" }}>
              다시 시도
            </Text>
          </Pressable>
        </View>
      </>
    );
  if (!bags || bags.length === 0)
    return (
      <View style={st.emptyScreen}>
        <Header />
        <ScrollView contentContainerStyle={st.emptyContent}>
          <Text style={st.emptyHeading}>내 가방</Text>
          <View style={st.emptyCard}>
            <EmptyPassportArtwork />
            <Text style={st.emptyTitle}>아직 등록된 제품이 없습니다</Text>
            <Text style={st.emptyDescription}>
              가방 안쪽 황동 플레이트의 고유번호로{`\n`}첫 여권을 시작할 수 있습니다
            </Text>
            <Pressable style={st.registerButton} onPress={() => router.push("/register")}>
              <Text style={st.registerText}>＋ 제품 등록하기</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  const hero = bags?.[0];
  const rest = bags?.slice(1) ?? [];
  const needsAttention = (bags ?? []).filter(
    (b) => b.lastDiagnosedAt === null || daysSince(b.lastDiagnosedAt) >= REDIAGNOSE_THRESHOLD_DAYS,
  ).length;
  return (
    <>
      <Header />
      <ScrollView contentContainerStyle={common.content}>
        {needsAttention > 0 && (
          <Pressable style={st.alert} onPress={() => router.push("/bags")}>
            <Text>● 재진단 권장 {needsAttention}건</Text>
            <Text>›</Text>
          </Pressable>
        )}
        {hero ? (
          <Pressable
            style={st.hero}
            onPress={() =>
              router.push({ pathname: "/bags/detail", params: { id: String(hero.id) } })
            }
          >
            <Image source={bag} style={common.bag} />
            <View style={{ flex: 1 }}>
              <Text style={st.grade}>
                {hero.overallGrade ? `등급 ${gradeLabel(hero.overallGrade)}` : "진단 전"}
              </Text>
              <Text>{hero.nickname || hero.modelName}</Text>
              <Text style={common.muted}>함께한 지 {hero.ownershipDays}일</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={[common.card, { alignItems: "center" }]}
            onPress={() => router.push("/register")}
          >
            <Text>등록된 제품이 없습니다. 첫 제품을 등록해보세요.</Text>
          </Pressable>
        )}
        <Pressable style={st.arCard} onPress={() => router.push("/ar/intro")}>
          <Text style={st.arIcon}>◈</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.arTitle}>AR로 가방 히스토리 보기</Text>
            <Text style={common.muted}>카메라로 가방을 비추면 히스토리를 바로 보여드려요</Text>
          </View>
          <Text>›</Text>
        </Pressable>
        <View style={st.careCard}>
          <Text style={st.careTitle}>지금 케어를 권장합니다</Text>
          <Text style={common.muted}>
            가방 상태에 맞는 셀프 케어를 확인하거나 공식 매장을 예약해보세요.
          </Text>
          <View style={st.careActions}>
            <Pressable
              style={st.careOutline}
              onPress={() =>
                router.push({ pathname: "/care/self", params: hero ? { id: String(hero.id) } : {} })
              }
            >
              <Text>셀프 케어</Text>
            </Pressable>
            <Pressable
              style={st.carePrimary}
              onPress={() =>
                router.push({
                  pathname: "/care/booking",
                  params: hero ? { id: String(hero.id) } : {},
                })
              }
            >
              <Text style={{ color: "#fff" }}>공식 예약</Text>
            </Pressable>
          </View>
        </View>
        <View style={st.head}>
          <Text style={common.section}>내 가방 전체</Text>
          <Text style={common.muted}>{bags?.length ?? 0}개</Text>
        </View>
        {rest.map((b) => (
          <Pressable
            style={st.bagRow}
            key={b.id}
            onPress={() => router.push({ pathname: "/bags/detail", params: { id: String(b.id) } })}
          >
            <Image source={bag} style={st.small} />
            <View style={{ flex: 1 }}>
              <Text>{b.nickname || b.modelName}</Text>
              <Text style={common.muted}>
                {b.overallGrade ? `등급 ${gradeLabel(b.overallGrade)}` : "진단 전"} ·{" "}
                {b.ownershipDays}일
              </Text>
            </View>
          </Pressable>
        ))}
        <Pressable style={st.addRow} onPress={() => router.push("/register")}>
          <View style={st.addIconBox}>
            <Text style={st.addIcon}>＋</Text>
          </View>
          <Text style={st.addText}>제품 등록</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
const st = StyleSheet.create({
  alert: {
    height: 40,
    backgroundColor: "#f2f2f2",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  arCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F6EFE1",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  arIcon: { fontSize: 22, color: colors.gold },
  arTitle: { fontWeight: "700", marginBottom: 2 },
  careCard: { padding: 14, borderRadius: 10, backgroundColor: colors.soft, gap: 8 },
  careTitle: { fontSize: 15, fontWeight: "600" },
  careActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  careOutline: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#BDBDBD",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  carePrimary: {
    flex: 1,
    height: 40,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dark,
  },
  grade: { backgroundColor: "#eee", alignSelf: "flex-start", padding: 4 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bagRow: {
    height: 68,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  small: { width: 58, height: 45, resizeMode: "contain" },
  emptyScreen: { flex: 1, backgroundColor: "#fff" },
  emptyContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 20 },
  emptyHeading: { fontSize: 16, color: "#444", marginBottom: 10 },
  emptyCard: {
    flex: 1,
    minHeight: 520,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D0C9",
    borderRadius: 12,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 28,
  },
  emptyTitle: { fontSize: 13, color: "#3F3F3F", marginTop: 22 },
  emptyDescription: {
    fontSize: 10,
    color: "#AAA",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 38,
  },
  registerButton: {
    width: 160,
    height: 48,
    borderRadius: 5,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 17,
  },
  registerText: { fontSize: 12, color: "#FFF" },
  emptyArt: {
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
  paperText: { fontSize: 8, lineHeight: 16, color: "#8D7655" },
  openBook: {
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
  bookSpine: {
    position: "absolute",
    left: 85,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: "#BDA379",
    zIndex: 3,
  },
  bookPage: { width: 85, padding: 9, alignItems: "center" },
  bookLogo: { fontSize: 12, fontWeight: "700", color: "#765B39", marginTop: 3 },
  bookCaption: { fontSize: 5, letterSpacing: 1, color: "#987B55", marginTop: 2 },
  bookPhoto: {
    width: 42,
    height: 47,
    borderWidth: 1,
    borderColor: "#B9A27E",
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bookPhotoMark: { fontSize: 20, color: "#B2966E" },
  bookLine: { height: 1, width: 47, backgroundColor: "#C8B18D", marginTop: 8 },
  bookLineShort: { height: 1, width: 32, backgroundColor: "#C8B18D", marginTop: 5 },
  journeyTitle: { fontSize: 7, fontWeight: "700", color: "#755C3A", marginTop: 8 },
  miniStamps: { flexDirection: "row", gap: 5, marginTop: 15 },
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
  route: {
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
  tag: {
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
  addRow: { height: 56, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  addIconBox: {
    width: 58,
    height: 45,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#BDBDBD",
    alignItems: "center",
    justifyContent: "center",
  },
  addIcon: { fontSize: 16, color: "#999" },
  addText: { color: "#555" },
});
