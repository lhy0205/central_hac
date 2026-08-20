import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";
import { Header } from "../../src/components/UI";
import { ApiError, diagnosisApi } from "../../src/api/client";
import type { PickedPhoto } from "../../src/components/PhotoPicker";
import { common, colors } from "../../src/theme";
export default function Analysis() {
  const { id, photos } = useLocalSearchParams<{ id?: string; photos?: string }>();
  const [p, setP] = useState(0);
  useEffect(() => {
    let parsed: PickedPhoto[] = [];
    try {
      parsed = JSON.parse(photos || "[]");
    } catch {}

    const timer = setInterval(() => {
      setP((x) => {
        if (x >= 95) return x;
        const step = Math.max(1, Math.round((95 - x) * 0.12));
        return Math.min(95, x + step);
      });
    }, 60);
    if (!id) {
      clearInterval(timer);
      Alert.alert("오류", "제품 정보를 찾을 수 없습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
      return () => clearInterval(timer);
    }
    let cancelled = false;
    diagnosisApi
      .create(id, "SELF", parsed)
      .then((diagnosis) => {
        if (cancelled) return;
        clearInterval(timer);
        setP(100);
        router.replace({
          pathname: "/diagnosis/result",
          params: { id: String(diagnosis.id), passportId: id },
        });
      })
      .catch((reason) => {
        if (cancelled) return;
        clearInterval(timer);

        const code = reason instanceof ApiError ? reason.code : "";
        const detail =
          reason instanceof ApiError
            ? reason.message
            : "서버에 연결할 수 없습니다. 네트워크와 백엔드 상태를 확인해주세요.";
        const guide =
          code === "DIAGNOSIS_IMAGE_UNREADABLE"
            ? "사진을 다시 촬영해주세요. 밝은 곳에서 초점을 맞추면 인식률이 올라갑니다."
            : code === "DEFECT_DETECTION_UNAVAILABLE"
              ? "진단 AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."
              : "잠시 후 다시 시도해주세요.";
        Alert.alert("진단 실패", `${detail}\n\n${guide}${code ? `\n(${code})` : ""}`, [
          { text: "확인", onPress: () => router.back() },
        ]);
      });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const step = p >= 82 ? 3 : p >= 48 ? 2 : p >= 18 ? 1 : 0;
  return (
    <>
      <Header title="진단" />
      <View style={st.screen}>
        <View style={st.progress}>
          <View style={[st.fill, { width: `${Math.max(66, p)}%` }]} />
        </View>
        <View style={st.stepRow}>
          <Text style={st.stepText}>2단계 · 분석</Text>
          <Text style={st.stepHint}>약 20초 소요됩니다</Text>
        </View>
        <View style={st.ring}>
          <Text style={{ fontSize: 28 }}>▱</Text>
          <Text style={{ fontSize: 20, color: colors.brown }}>{p}%</Text>
        </View>
        <Text style={st.title}>
          {p < 100 ? "사진을 분석하고 있습니다" : "분석이 완료되었습니다"}
        </Text>
        <Text style={[common.muted, { textAlign: "center" }]}>
          기존 사진과 비교해 변화를 계산하는 중입니다
        </Text>
        <View style={st.checks}>
          {[
            ["사진 품질 확인", "4장 모두 사용 가능합니다"],
            ["부위별 상태 평가", "마모 · 코팅 · 변색 · 부자재"],
            ["기준 사진과 비교", "등록 때 찍은 사진과 대조합니다"],
          ].map(([a, b], i) => (
            <View style={st.check} key={a}>
              <Text style={{ color: i < step ? colors.gold : colors.muted, fontSize: 18 }}>
                {i < step ? "✓" : "◌"}
              </Text>
              <View>
                <Text>{a}</Text>
                <Text style={common.muted}>{i < step ? b : "진행을 기다리고 있습니다"}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={st.keepGoing}>화면을 벗어나도 분석은 계속됩니다</Text>
      </View>
    </>
  );
}
const st = StyleSheet.create({
  screen: { flex: 1, padding: 18 },
  progress: { height: 4, backgroundColor: "#eee" },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  stepText: { fontSize: 13, color: "#2A2A2A", fontWeight: "600" },
  stepHint: { fontSize: 11.5, color: "#A0A0A0" },
  keepGoing: { fontSize: 11, color: "#B0B0B0", textAlign: "center", marginBottom: 10 },
  fill: { height: "100%", backgroundColor: colors.gold },
  ring: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 5,
    borderColor: colors.gold,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 90,
  },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center", marginTop: 35, marginBottom: 8 },
  checks: {
    marginTop: "auto",
    marginBottom: 35,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  check: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
});
