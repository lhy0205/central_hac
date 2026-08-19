import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { diagnosisApi } from "../../src/api/client";
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
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>셀프 케어 가이드</Text>
        <View style={styles.statusRow}>
          {loading ? (
            <>
              <ActivityIndicator size="small" color={colors.brown} />
              <Text style={styles.caption}>진단 결과를 확인하고 있습니다</Text>
            </>
          ) : (
            <Text style={styles.caption}>
              {autoSelected
                ? "최신 진단 결과에서 증상이 자동 선택되었습니다"
                : "소재와 증상을 선택하면 가이드가 바뀝니다"}
            </Text>
          )}
        </View>
        <Text style={styles.label}>소재</Text>
        <View style={styles.chipRow}>
          {MATERIALS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setMaterial(item)}
              style={[styles.chip, material === item && styles.chipOn]}
            >
              <Text style={[styles.chipText, material === item && styles.chipTextOn]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>증상 · 복수 선택 가능</Text>
        <View style={styles.chipRow}>
          {SYMPTOMS.map((item) => (
            <Pressable
              key={item}
              onPress={() => toggle(item)}
              style={[styles.chip, symptoms.includes(item) && styles.chipOn]}
            >
              <Text style={[styles.chipText, symptoms.includes(item) && styles.chipTextOn]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.rule} />
        <Text style={styles.sectionTitle}>
          관리 순서 {guide.steps.length}단계 · 예상 {guide.minutes}분
        </Text>
        {guide.steps.map(([title, description], index) => (
          <View key={`${title}-${index}`} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{title}</Text>
              <Text style={styles.stepDescription}>{description}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.sectionTitle}>준비물</Text>
        <View style={styles.outlineBox}>
          {guide.supplies.map((item) => (
            <Text key={item} style={styles.bullet}>
              ●　{item}
            </Text>
          ))}
        </View>
        <Text style={styles.sectionTitle}>주의사항</Text>
        <View style={styles.notice}>
          {guide.warnings.map((item) => (
            <Text key={item} style={styles.bullet}>
              ●　{item}
            </Text>
          ))}
        </View>
        {guide.officialRecommended && (
          <View style={styles.recommend}>
            <Text style={styles.recommendTitle}>공식 케어를 권장하는 증상이 포함되어 있습니다</Text>
            <Text style={styles.recommendText}>
              코팅 또는 도금 손상은 셀프 케어로 복원하기 어렵습니다.
            </Text>
          </View>
        )}
        <Pressable
          style={styles.bookingLink}
          onPress={() => router.push({ pathname: "/care/booking", params: id ? { id } : {} })}
        >
          <View>
            <Text style={styles.linkTitle}>직접 하기 어렵다면</Text>
            <Text style={styles.linkSub}>공식 케어 예약으로 전환할 수 있습니다</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={complete}>
          <Text style={styles.primaryText}>케어를 완료했습니다 · 여권에 기록하기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 50, backgroundColor: "#fff" },
  title: { fontSize: 20, color: "#333", marginTop: 8 },
  statusRow: { height: 38, flexDirection: "row", alignItems: "center", gap: 8 },
  caption: { fontSize: 10, color: "#999" },
  label: { fontSize: 10, color: "#888", marginTop: 8, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: {
    height: 30,
    minWidth: 70,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#454545", borderColor: "#454545" },
  chipText: { fontSize: 10, color: "#666" },
  chipTextOn: { color: "#fff" },
  rule: { height: 1, backgroundColor: "#E9E9E9", marginVertical: 16 },
  sectionTitle: { fontSize: 13, color: "#444", marginTop: 12, marginBottom: 10 },
  stepRow: { flexDirection: "row", minHeight: 70 },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#444",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  stepNumberText: { fontSize: 10, color: "#fff" },
  stepCopy: { flex: 1, borderBottomWidth: 1, borderBottomColor: "#EFEFEF", paddingBottom: 12 },
  stepTitle: { fontSize: 12, color: "#454545", marginBottom: 5 },
  stepDescription: { fontSize: 10, color: "#888", lineHeight: 16 },
  outlineBox: { borderWidth: 1, borderColor: "#DDD", borderRadius: 7, padding: 13, gap: 9 },
  notice: { backgroundColor: "#F6F6F6", borderRadius: 7, padding: 13, gap: 9 },
  bullet: { fontSize: 10, color: "#606060", lineHeight: 15 },
  recommend: {
    marginTop: 13,
    borderWidth: 1,
    borderColor: "#D8C09C",
    borderRadius: 7,
    padding: 13,
    backgroundColor: "#FBF6EE",
  },
  recommendTitle: { fontSize: 11, fontWeight: "600", color: colors.brown },
  recommendText: { fontSize: 9, color: "#806F5B", marginTop: 4 },
  bookingLink: {
    height: 58,
    marginTop: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkTitle: { fontSize: 11, color: "#555" },
  linkSub: { fontSize: 8, color: "#999", marginTop: 4 },
  chevron: { color: "#555" },
  primary: {
    height: 50,
    marginTop: 20,
    borderRadius: 3,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 11 },
});
