import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";

import { diagnosisApi } from "../../src/api/client";
import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { Header } from "../../src/components/UI";
import {
  buildCareGuide,
  MATERIALS,
  SYMPTOMS,
  symptomsFromScores,
  type CareMaterial,
  type CareSymptom,
} from "../../src/care/guideData";
import { colors } from "../../src/theme";

export default function SelfCareGuide() {
  const bottomPad = useTabBarClearance(20);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [material, setMaterial] = useState<CareMaterial>("코팅 캔버스");
  const [symptoms, setSymptoms] = useState<CareSymptom[]>(["모서리 마모", "코팅 벗겨짐"]);
  const [loading, setLoading] = useState(Boolean(id));
  const [autoSelected, setAutoSelected] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    diagnosisApi
      .list(id, 0, 1, "diagnosedAt,desc")
      .then((page) => {
        const latest = page.content[0];
        if (!latest) return;
        const detected = symptomsFromScores(latest.itemScores);
        if (detected.length) {
          setSymptoms(detected);
          setAutoSelected(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const guide = useMemo(() => buildCareGuide(material, symptoms), [material, symptoms]);

  function toggle(symptom: CareSymptom) {
    setAutoSelected(false);
    setSymptoms((current) =>
      current.includes(symptom)
        ? current.length === 1
          ? current
          : current.filter((item) => item !== symptom)
        : [...current, symptom],
    );
  }

  // 케어를 마치면 기록 화면으로 넘어가고, 저장되면 여권에 스탬프가 찍힌다.
  function complete() {
    if (!id) return Alert.alert("제품 선택 필요", "케어 기록을 남기려면 먼저 제품을 선택해주세요.");
    router.push({
      pathname: "/care/record",
      params: {
        id,
        careType: `셀프 케어 · ${symptoms.join(", ")}`,
        materialType: material,
        notes: `관리 증상: ${symptoms.join(", ")}`,
      },
    });
  }

  return (
    <View style={styles.screen}>
      <Header title="셀프 케어" back hideProfile />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>셀프 케어 가이드</Text>
        <View style={styles.statusRow}>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={styles.auto}>
              {autoSelected ? "진단 결과 기준 자동 선택됨" : "증상을 직접 골라보세요"}
            </Text>
          )}
        </View>

        <View style={styles.pickRow}>
          <Text style={styles.pickLabel}>소재</Text>
          <View style={styles.chips}>
            {MATERIALS.map((item) => (
              <Pressable
                key={item}
                onPress={() => setMaterial(item)}
                style={({ pressed }) => [
                  styles.chip,
                  material === item && styles.chipOn,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, material === item && styles.chipTextOn]}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.pickRow}>
          <Text style={styles.pickLabel}>증상</Text>
          <View style={styles.chips}>
            {SYMPTOMS.map((item) => (
              <Pressable
                key={item}
                onPress={() => toggle(item)}
                style={({ pressed }) => [
                  styles.chip,
                  symptoms.includes(item) && styles.chipOn,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, symptoms.includes(item) && styles.chipTextOn]}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.rule} />

        <Text style={styles.section}>준비물</Text>
        <View style={styles.box}>
          {guide.supplies.map((item) => (
            <View key={item} style={styles.bullet}>
              <Text style={styles.bulletMark}>◆</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>주의사항</Text>
        <View style={[styles.box, styles.warnBox]}>
          {guide.warnings.map((item) => (
            <View key={item} style={styles.bullet}>
              <Text style={styles.bulletMark}>◆</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>
          관리 순서 {guide.steps.length}단계 · 예상 {guide.minutes}분
        </Text>
        {guide.steps.map(([stepTitle, detail], index) => (
          <View key={stepTitle} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{stepTitle}</Text>
              <Text style={styles.stepDetail}>{detail}</Text>
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => router.push({ pathname: "/care/booking", params: id ? { id } : {} })}
          style={({ pressed }) => [styles.official, pressed && styles.officialPressed]}
        >
          <View style={styles.officialBody}>
            <Text style={styles.officialTitle}>직접 하기 어렵다면</Text>
            <Text style={styles.officialText}>공식 케어 예약으로 전환할 수 있습니다</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          onPress={complete}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>케어를 완료했습니다 · 여권에 기록하기</Text>
        </Pressable>
      </ScrollView>

      <BottomTabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 21, fontWeight: "800", color: "#111" },
  statusRow: { minHeight: 24, justifyContent: "center", marginTop: 6, marginBottom: 12 },
  auto: { fontSize: 11.5, color: "#B0B0B0" },

  pickRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 12 },
  pickLabel: { width: 30, fontSize: 12.5, color: "#555", paddingTop: 8 },
  chips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 33,
    paddingHorizontal: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: "#7A4E15", borderColor: "#7A4E15" },
  chipPressed: { transform: [{ scale: 0.96 }] },
  chipText: { fontSize: 12.5, color: "#555" },
  chipTextOn: { color: "#fff", fontWeight: "600" },

  rule: { height: 1, backgroundColor: "#E3DED4", marginVertical: 14 },
  section: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginTop: 22, marginBottom: 10 },
  box: { borderWidth: 1, borderColor: "#E3DED4", borderRadius: 8, padding: 14, gap: 11 },
  warnBox: { backgroundColor: "#FDFBF5" },
  bullet: { flexDirection: "row", gap: 9 },
  bulletMark: { fontSize: 7, color: "#8A6A3E", lineHeight: 18 },
  bulletText: { flex: 1, fontSize: 12.5, color: "#3A3A3A", lineHeight: 19 },

  step: { flexDirection: "row", gap: 12, marginBottom: 16 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#8A5A20",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 13, fontWeight: "600", color: "#1A1A1A", marginBottom: 5 },
  stepDetail: { fontSize: 12, color: "#9A9A9A", lineHeight: 19 },

  official: {
    marginTop: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E3DED4",
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  officialPressed: { backgroundColor: "#FAFAF8" },
  officialBody: { flex: 1 },
  officialTitle: { fontSize: 12.5, fontWeight: "600", color: "#1A1A1A", marginBottom: 5 },
  officialText: { fontSize: 11, color: "#A8A8A8" },
  chevron: { fontSize: 15, color: "#B0B0B0" },

  cta: {
    height: 62,
    borderRadius: 10,
    backgroundColor: "#7A4E15",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { backgroundColor: "#8F5D1D", transform: [{ scale: 0.98 }] },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
