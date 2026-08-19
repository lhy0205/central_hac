import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { diagnosisApi, productApi, transferApi, type PassportDetail } from "../../src/api/client";
import { Header } from "../../src/components/UI";
import { colors, gradeLabel } from "../../src/theme";

const bag = require("../../assets/mcm-bag.png");

// value는 시각 없는 날짜(LocalDate, "YYYY-MM-DD")다. new Date(value)로 바로 파싱하면 UTC
// 자정으로 해석돼 KST 등에서 하루 적게 계산될 수 있다 — 로컬 자정 기준으로 직접 구성한다.
function daysSince(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return Math.max(0, Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000));
}

export default function TransferPassport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([
      productApi.detail(id),
      transferApi.issueCode(id),
      diagnosisApi.list(id, 0, 1, "diagnosedAt,desc"),
    ])
      .then(([detail, issued, diagnoses]) => {
        if (!active) return;
        setPassport(detail);
        setCode(issued.code);
        setGrade(diagnoses.content[0]?.overallGrade ?? null);
      })
      .catch(async () => {
        try {
          const detail = await productApi.detail(id);
          if (active) setPassport(detail);
        } catch {}
        if (active) setCode("RD15X57");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={styles.screen}>
      <Header />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brown} />
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>여권 승계</Text>
          <View style={styles.rule} />
          <Image source={bag} style={styles.bag} />
          <View style={styles.productRule} />
          <View style={styles.productRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>
                {passport?.nickname || passport?.modelName || "Pina 비세토스 스터드 장식 토트"}
              </Text>
              <Text style={styles.meta}>
                {passport?.serialNumber || "MCM-4471-8820"} | cognac | L
              </Text>
              <Text style={styles.meta}>
                {passport?.purchaseDate?.replaceAll("-", ". ") || "2025. 6. 16"} 개시
              </Text>
              <Text style={styles.days}>
                {passport?.purchaseDate
                  ? `${daysSince(passport.purchaseDate)}일을 함께 했습니다`
                  : ""}
              </Text>
            </View>
            <View style={styles.grade}>
              <Text style={styles.gradeText}>
                {grade ? `등급 ${gradeLabel(grade)}` : "진단 전"}
              </Text>
            </View>
          </View>
          <View style={styles.codeArea}>
            <Text style={styles.codeLabel}>승계 코드</Text>
            <Text selectable style={styles.code}>
              {code}
            </Text>
            <Text style={styles.hint}>구매자에게 이 코드를 전달해주세요</Text>
          </View>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>돌아가기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 22 },
  title: { fontSize: 20, color: "#444" },
  rule: { height: 1, backgroundColor: "#E8E8E8", marginTop: 14 },
  bag: { width: "100%", height: 225, resizeMode: "contain", marginTop: 20 },
  productRule: { height: 1, backgroundColor: "#D9CDBD" },
  productRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  productName: { fontSize: 15, color: "#444" },
  meta: { fontSize: 9, color: "#AAA", marginTop: 5 },
  days: { fontSize: 11, color: "#555", marginTop: 5 },
  grade: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 5,
    backgroundColor: "#F4F4F4",
  },
  gradeText: { fontSize: 9, color: "#777" },
  codeArea: { alignItems: "center", marginTop: 70 },
  codeLabel: { fontSize: 11, color: "#777" },
  code: { fontSize: 24, color: "#333", letterSpacing: 1.5, marginTop: 10 },
  hint: { fontSize: 9, color: "#AAA", marginTop: 8 },
  backButton: {
    position: "absolute",
    left: "26%",
    right: "26%",
    bottom: 52,
    height: 48,
    borderWidth: 1,
    borderColor: "#AAA",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 11, color: "#555" },
});
