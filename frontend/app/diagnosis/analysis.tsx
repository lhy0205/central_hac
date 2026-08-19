import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Header } from "../../src/components/UI";
import { diagnosisApi } from "../../src/api/client";
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
    // 매번 고정폭(1%)으로 채우면 95%까지 약 4.3초가 걸린다 — 실제 진단은 AI 서버가 빨라진
    // 뒤로 1~2초면 끝나서, 막대가 20~40%쯤에서 갑자기 100%로 튀어 어색해 보였다. 남은
    // 거리에 비례해 증가폭을 줄이는 감속 곡선으로 바꾼다 — 처음엔 빠르게 채워지고 95%
    // 근처에서 느려지므로, 실제 요청이 언제 끝나든(빠르든 느리든) 자연스럽게 이어진다.
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
      .catch(() => {
        if (cancelled) return;
        clearInterval(timer);
        Alert.alert("진단 실패", "진단 처리 중 문제가 발생했습니다. 다시 시도해주세요.", [
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
            ["기존 사진과 비교", "이전 진단과 비교"],
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
      </View>
    </>
  );
}
const st = StyleSheet.create({
  screen: { flex: 1, padding: 18 },
  progress: { height: 4, backgroundColor: "#eee" },
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
