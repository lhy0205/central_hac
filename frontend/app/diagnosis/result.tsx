import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";
import { AppButton, Header } from "../../src/components/UI";
import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import {
  diagnosisApi,
  journeyApi,
  type DiagnosisDetail,
  type TimelineItem,
} from "../../src/api/client";
import { common, colors, displayGrade } from "../../src/theme";
const bag = require("../../assets/mcm-bag.png");

const GRADE_ORDER = ["S", "A", "B", "C", "D"];
const ROW_H = 24;
const COL_W = 46;
function fmtDate(iso: string) {
  return iso.slice(2, 10).replace(/-/g, ".");
}
function TrendChart({ points }: { points: { grade: string; date: string }[] }) {
  if (points.length === 0) return null;
  const chartH = GRADE_ORDER.length * ROW_H;
  const chartW = Math.max(points.length * COL_W, COL_W);
  const coords = points.map((p, i) => ({
    x: i * COL_W + COL_W / 2,
    y: Math.max(0, GRADE_ORDER.indexOf(p.grade)) * ROW_H + ROW_H / 2,
  }));
  return (
    <View style={st.trendWrap}>
      <View>
        {GRADE_ORDER.map((g) => (
          <Text key={g} style={[st.trendRowLabel, { height: ROW_H, lineHeight: ROW_H }]}>
            {g}
          </Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: chartW, height: chartH + 18 }}>
          {GRADE_ORDER.map((g, i) => (
            <View key={g} style={[st.trendRowLine, { top: i * ROW_H + ROW_H / 2 }]} />
          ))}
          {coords.slice(0, -1).map((c, i) => {
            const n = coords[i + 1];
            const dx = n.x - c.x,
              dy = n.y - c.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const midX = (c.x + n.x) / 2,
              midY = (c.y + n.y) / 2;
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: midX - length / 2,
                  top: midY - 1,
                  width: length,
                  height: 2,
                  backgroundColor: colors.gold,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
          {coords.map((c, i) => (
            <View key={i} style={[st.trendDot, { left: c.x - 5, top: c.y - 5 }]} />
          ))}
          {points.map((p, i) => (
            <Text
              key={i}
              style={[st.trendDate, { left: i * COL_W, width: COL_W, top: chartH + 4 }]}
            >
              {p.date}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
function compareText(prev: DiagnosisDetail, current: DiagnosisDetail) {
  const prevRank = GRADE_ORDER.indexOf(displayGrade(prev.overallGrade) ?? "");
  const curRank = GRADE_ORDER.indexOf(displayGrade(current.overallGrade) ?? "");
  if (prevRank < 0 || curRank < 0) return null;
  const days = Math.max(
    0,
    Math.round(
      (new Date(current.diagnosedAt).getTime() - new Date(prev.diagnosedAt).getTime()) / 86400000,
    ),
  );
  const steps = Math.abs(curRank - prevRank);
  const direction =
    curRank > prevRank
      ? `${steps}단계 하락`
      : curRank < prevRank
        ? `${steps}단계 상승`
        : "동일 유지";
  return `이전 진단 대비 ${displayGrade(prev.overallGrade)}→${displayGrade(current.overallGrade)}, ${days}일 만에 ${direction}`;
}

function gradeColor(grade: string | null | undefined) {
  if (grade === "S" || grade === "A") return colors.gold;
  if (grade === "B") return colors.brown;
  return colors.danger;
}
function scoreColor(score: number) {
  if (score >= 70) return colors.danger;
  if (score >= 40) return colors.brown;
  return colors.gold;
}
export default function Result() {
  const bottomPad = useTabBarClearance(20);
  const { id, passportId } = useLocalSearchParams<{ id?: string; passportId?: string }>();
  const [list, setList] = useState<DiagnosisDetail[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [item, setItem] = useState<DiagnosisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      if (!passportId) return;
      let active = true;
      setLoading(true);
      Promise.all([diagnosisApi.list(passportId), journeyApi.list(passportId)])
        .then(([res, tl]) => {
          if (!active) return;
          const sorted = [...res.content].sort(
            (a, b) => new Date(a.diagnosedAt).getTime() - new Date(b.diagnosedAt).getTime(),
          );
          setList(sorted);
          setTimeline(tl);
          setItem(sorted.find((d) => String(d.id) === id) ?? sorted.at(-1) ?? null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [passportId, id]),
  );
  if (loading || !item)
    return (
      <View style={{ flex: 1 }}>
        <Header title="진단 결과" back />
        <View style={[common.content, { flex: 1, alignItems: "center", paddingTop: 60 }]}>
          <ActivityIndicator />
        </View>
        <BottomTabBar active="diagnosis" />
      </View>
    );
  const itemKeys = Object.keys(item.itemScores);
  const currentIndex = list.findIndex((d) => d.id === item.id);
  const previous = currentIndex > 0 ? list[currentIndex - 1] : null;
  const compare = previous ? compareText(previous, item) : null;
  const stampIndex = timeline.findIndex((t) => t.type === "DIAGNOSIS" && t.id === item.id);
  const problemLabel =
    item.problemAreas && item.problemAreas.length > 0
      ? item.problemAreas.map((p) => p.location).join(", ")
      : null;
  return (
    <View style={{ flex: 1 }}>
      <Header title="진단 결과" back />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[common.content, { paddingBottom: bottomPad }]}
      >
        <Text style={common.muted}>진단 내역 선택</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[...list].reverse().map((x, i) => (
            <Pressable
              key={x.id}
              style={[st.tab, item.id === x.id && st.on]}
              onPress={() => setItem(x)}
            >
              <Text style={st.tabGrade}>{displayGrade(x.overallGrade)}</Text>
              <Text style={st.tabMeta}>{list.length - i}회</Text>
              <Text style={common.muted}>{x.diagnosedAt.slice(2, 10)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={st.summaryCard}>
          <Text style={st.summaryLabel}>종합 등급</Text>
          <View style={st.summaryRow}>
            <View
              style={[st.gradeBadge, { borderColor: gradeColor(displayGrade(item.overallGrade)) }]}
            >
              <Text
                style={[st.gradeBadgeText, { color: gradeColor(displayGrade(item.overallGrade)) }]}
              >
                {displayGrade(item.overallGrade)}
              </Text>
            </View>
            {previous && (
              <View style={{ flex: 1, gap: 4 }}>
                <View style={st.compareRow}>
                  <Text style={st.compareGrade}>{displayGrade(previous.overallGrade)}</Text>
                  <Text style={st.compareArrow}>→</Text>
                  <Text
                    style={[
                      st.compareGrade,
                      { color: gradeColor(displayGrade(item.overallGrade)) },
                    ]}
                  >
                    {displayGrade(item.overallGrade)}
                  </Text>
                </View>
                {compare && <Text style={common.muted}>{compare.split(", ")[1] ?? compare}</Text>}
              </View>
            )}
          </View>
          <View style={st.summaryFooter}>
            <Text style={common.muted}>
              {item.diagnosisType === "STORE" ? "매장 진단" : "자가 진단"} ·{" "}
              {item.diagnosedAt.slice(0, 10)}
            </Text>
          </View>
        </View>

        {list.length > 1 && (
          <View style={common.card}>
            <Text style={common.section}>추이</Text>
            <TrendChart
              points={list.map((d) => ({
                grade: displayGrade(d.overallGrade) ?? "",
                date: fmtDate(d.diagnosedAt),
              }))}
            />
          </View>
        )}

        <Text style={common.section}>문제 부위{problemLabel ? ` · ${problemLabel}` : ""}</Text>
        <View style={st.photoWrap}>
          <Image source={item.imageUrls?.[0] ? { uri: item.imageUrls[0] } : bag} style={st.bag} />
        </View>

        <Text style={common.section}>항목별 점수</Text>
        <View style={{ gap: 14 }}>
          {itemKeys.map((key) => (
            <View key={key}>
              <View style={st.head}>
                <Text style={st.itemLabel}>{key}</Text>
                <Text style={st.itemScore}>
                  {item.itemScores[key]}
                  {item.previousItemScores && (
                    <Text style={common.muted}> (이전 {item.previousItemScores[key] ?? "-"})</Text>
                  )}
                </Text>
              </View>
              <View style={st.bar}>
                <View
                  style={[
                    st.fill,
                    {
                      width: `${item.itemScores[key]}%`,
                      backgroundColor: scoreColor(item.itemScores[key]),
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        <View style={common.card}>
          <Text style={common.section}>판정 근거</Text>
          {item.problemAreas && item.problemAreas.length > 0 ? (
            item.problemAreas.map((p, i) => (
              <Text key={i} style={st.evidenceLine}>
                • {p.detail}
              </Text>
            ))
          ) : (
            <Text style={st.evidenceLine}>{item.evidenceText}</Text>
          )}
        </View>

        {stampIndex >= 0 && (
          <Text style={common.muted}>
            여권에 기록되었습니다 · 스탬프 {stampIndex + 1}/{timeline.length} · 진단{" "}
            {currentIndex + 1}회차
          </Text>
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <AppButton
              outline
              title="다시 진단"
              onPress={() =>
                router.replace({
                  pathname: "/(tabs)/diagnosis",
                  params: passportId ? { id: passportId } : undefined,
                })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton
              title="여권에서 보기"
              onPress={() =>
                router.push(
                  passportId
                    ? { pathname: "/journey/passport", params: { id: passportId } }
                    : "/(tabs)/journey",
                )
              }
            />
          </View>
        </View>
      </ScrollView>
      <BottomTabBar active="diagnosis" />
    </View>
  );
}
const st = StyleSheet.create({
  tab: {
    width: 78,
    padding: 8,
    marginRight: 7,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    alignItems: "center",
  },
  on: { borderColor: colors.gold, backgroundColor: "#faf6ef" },
  tabGrade: { fontSize: 18, color: colors.brown, fontWeight: "700" },
  tabMeta: { fontSize: 12, color: colors.dark },
  summaryCard: {
    backgroundColor: colors.soft,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  summaryLabel: { fontSize: 13, color: colors.muted },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  gradeBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  gradeBadgeText: { fontSize: 32, fontWeight: "700" },
  compareRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  compareGrade: { fontSize: 20, fontWeight: "700", color: colors.dark },
  compareArrow: { fontSize: 16, color: colors.muted },
  summaryFooter: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 },
  photoWrap: { borderRadius: 12, overflow: "hidden" },
  bag: { width: "100%", height: 210, resizeMode: "contain", backgroundColor: colors.soft },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  itemLabel: { fontSize: 14, color: colors.dark },
  itemScore: { fontSize: 14, fontWeight: "600", color: colors.dark },
  bar: { height: 6, borderRadius: 3, backgroundColor: "#eee", marginTop: 6, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  evidenceLine: { marginTop: 4, lineHeight: 20 },
  trendWrap: { flexDirection: "row", gap: 6 },
  trendRowLabel: { fontSize: 11, color: colors.muted, textAlign: "center", width: 16 },
  trendRowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.line,
  },
  trendDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold,
  },
  trendDate: { position: "absolute", fontSize: 10, color: colors.muted, textAlign: "center" },
});
