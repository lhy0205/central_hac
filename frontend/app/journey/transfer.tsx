import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";

import { diagnosisApi, productApi, transferApi, type PassportDetail } from "../../src/api/client";
import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { Header } from "../../src/components/UI";
import { colors, gradeColor, gradeLabel } from "../../src/theme";

const bag = require("../../assets/mcm-bag.png");

function daysSince(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return Math.max(0, Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000));
}

export default function TransferPassport() {
  const bottomPad = useTabBarClearance(20);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([productApi.detail(id), diagnosisApi.list(id, 0, 1, "diagnosedAt,desc")])
      .then(([detail, diagnoses]) => {
        if (!active) return;
        setPassport(detail);
        setGrade(diagnoses.content[0]?.overallGrade ?? null);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  async function issue() {
    if (!id || issuing) return;
    setIssuing(true);
    try {
      const issued = await transferApi.issueCode(id);
      setCode(issued.code);
    } catch {
      setCode(null);
    } finally {
      setIssuing(false);
    }
  }

  const name = passport?.nickname || passport?.modelName || "-";
  const days = passport?.purchaseDate ? daysSince(passport.purchaseDate) : null;

  return (
    <View style={styles.screen}>
      <Header title="여권 승계" back hideProfile />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brown} />
        </View>
      ) : code == null ? (
        <View style={styles.center}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>승계하려는 제품이 맞나요?</Text>
            <Image source={bag} style={styles.dialogBag} />
            <View style={styles.nameRow}>
              <Text style={styles.name}>{name}</Text>
              {grade ? (
                <Text style={[styles.gradeBadge, { backgroundColor: gradeColor(grade) }]}>
                  등급 {gradeLabel(grade)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.meta}>{passport?.serialNumber ?? "-"}</Text>
            <Text style={styles.meta}>
              {passport?.purchaseDate?.replaceAll("-", ". ") ?? "-"} 개시
            </Text>
            {days != null ? <Text style={styles.days}>{days}일째 함께하고 있습니다</Text> : null}

            <View style={styles.dialogActions}>
              <Pressable
                disabled={issuing}
                onPress={() => void issue()}
                style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
              >
                <Text style={styles.outlineText}>{issuing ? "발급 중..." : "네 맞습니다"}</Text>
              </Pressable>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.filled, pressed && styles.pressed]}
              >
                <Text style={styles.filledText}>아니요 이 제품이 아닙니다</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.content, { paddingBottom: bottomPad }]}>
          <Text style={styles.title}>여권 승계</Text>
          <View style={styles.rule} />
          <View style={styles.heroWrap}>
            <Image source={bag} style={styles.hero} />
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name}</Text>
            {grade ? (
              <Text style={[styles.gradeBadge, { backgroundColor: gradeColor(grade) }]}>
                등급 {gradeLabel(grade)}
              </Text>
            ) : null}
          </View>
          <Text style={styles.meta}>{passport?.serialNumber ?? "-"}</Text>
          <Text style={styles.meta}>
            {passport?.purchaseDate?.replaceAll("-", ". ") ?? "-"} 개시
          </Text>
          {days != null ? <Text style={styles.days}>{days}일동안 함께 했습니다</Text> : null}

          <Text style={styles.codeLabel}>승계 코드</Text>
          <Text selectable style={styles.code}>
            {code}
          </Text>
          <Text style={styles.hint}>구매자에게 이 코드를 전달해주세요</Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.outline, styles.wide, pressed && styles.pressed]}
          >
            <Text style={styles.outlineText}>돌아가기</Text>
          </Pressable>
        </View>
      )}
      <BottomTabBar active="journey" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 22 },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  rule: { height: 1, backgroundColor: "#E8E8E8", marginTop: 14, marginBottom: 16 },

  dialog: {
    width: "100%",
    backgroundColor: "#F7F6F3",
    borderRadius: 14,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  dialogTitle: { fontSize: 16, fontWeight: "800", color: "#111", marginBottom: 16 },
  dialogBag: {
    width: "62%",
    height: 170,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 16,
  },
  dialogActions: { flexDirection: "row", gap: 10, marginTop: 18 },

  heroWrap: { alignItems: "center", marginBottom: 14 },
  hero: { width: "60%", height: 170, resizeMode: "contain" },
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
  days: { fontSize: 13, color: "#2A2A2A", marginTop: 10 },

  codeLabel: { fontSize: 11.5, color: "#9A9A9A", textAlign: "center", marginTop: 44 },
  code: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#111",
    textAlign: "center",
    marginTop: 10,
  },
  hint: { fontSize: 11, color: "#AAA", textAlign: "center", marginTop: 8 },

  outline: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { fontSize: 13, color: "#222" },
  filled: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
  },
  filledText: { fontSize: 13, color: "#fff", fontWeight: "500" },
  wide: { flex: 0, marginTop: "auto", marginBottom: 12 },
  pressed: { transform: [{ scale: 0.98 }] },
});
