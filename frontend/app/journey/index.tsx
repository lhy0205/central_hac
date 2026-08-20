import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../../src/components/BrandText";

import {
  journeyApi,
  productApi,
  type PassportDetail,
  type TimelineItem,
} from "../../src/api/client";
import { AppButton, Header } from "../../src/components/UI";
import { colors, common, gradeLabel } from "../../src/theme";

const bag = require("../../assets/mcm-bag.png");
const EVENT_TYPE_LABEL: Record<string, string> = {
  MOMENT: "순간 기록",
  STORE_VISIT: "매장 방문",
  SELF_CARE: "셀프 케어",
  OTHER: "기타",
};

function titleFor(item: TimelineItem) {
  if (item.type === "DIAGNOSIS")
    return `마모 진단 · 등급 ${gradeLabel(String(item.detail.overallGrade))}`;
  if (item.type === "CARE") return `케어 기록 · ${item.detail.careType}`;
  if (item.type === "NOTIFICATION") return String(item.detail.message ?? "알림");
  if (item.type === "REGISTRATION") return `여권 등록 · ${item.detail.modelName}`;
  if (item.type === "RESERVATION")
    return item.detail.status === "CANCELLED"
      ? `예약 취소 · ${item.detail.storeName}`
      : `매장 케어 예약 · ${item.detail.storeName}`;
  if (item.type === "TRANSFER") return "여권 승계 완료";
  return (
    String(item.detail.note ?? "") || EVENT_TYPE_LABEL[String(item.detail.eventType)] || "기록"
  );
}

function typeLabel(item: TimelineItem) {
  if (item.type === "DIAGNOSIS") return "진단";
  if (item.type === "CARE") return "케어";
  if (item.type === "REGISTRATION") return "등록";
  if (item.type === "NOTIFICATION") return "알림";
  if (item.type === "RESERVATION") return "예약";
  if (item.type === "TRANSFER") return "승계";
  return EVENT_TYPE_LABEL[String(item.detail.eventType)] || "기록";
}

export default function Journey() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      setLoading(true);
      Promise.all([productApi.detail(id), journeyApi.list(id)])
        .then(([detail, list]) => {
          if (!active) return;
          setPassport(detail);
          setItems([...list].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [id]),
  );

  if (loading || !passport)
    return (
      <>
        <Header />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </>
    );

  const latestDiagnosis = items.find((item) => item.type === "DIAGNOSIS");
  const currentGrade = latestDiagnosis
    ? gradeLabel(String(latestDiagnosis.detail.overallGrade))
    : null;

  return (
    <View style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>여권 타임라인</Text>
        <View style={styles.hero}>
          <Image source={bag} style={styles.heroBag} />
        </View>
        <View style={styles.productHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName}>{passport.nickname || passport.modelName}</Text>
            <Text style={styles.meta}>{passport.serialNumber} | cognac | L</Text>
            <Text style={styles.meta}>{passport.purchaseDate.replaceAll("-", ". ")} 개시</Text>
          </View>
          <View style={styles.grade}>
            <Text style={styles.gradeText}>
              {currentGrade ? `등급 ${currentGrade}` : "진단 전"}
            </Text>
          </View>
        </View>
        <View style={styles.days}>
          <Text style={styles.smallDiamond}>◆</Text>
          <Text style={styles.daysText}>
            {daysSince(passport.purchaseDate)}일째 함께하고 있습니다
          </Text>
        </View>

        <View style={styles.timeline}>
          <View style={styles.timelineLine} />
          {items.length === 0 ? (
            <Text style={styles.empty}>아직 기록이 없습니다.</Text>
          ) : (
            items.map((item) => (
              <Pressable
                key={`${item.type}-${item.id}`}
                style={styles.record}
                onPress={() => {
                  if (item.type === "USER_EVENT")
                    router.push({
                      pathname: "/journey/detail",
                      params: { id: String(item.id), passportId: id },
                    });
                  if (item.type === "DIAGNOSIS")
                    router.push({
                      pathname: "/diagnosis/result",
                      params: { id: String(item.id), passportId: id },
                    });
                  if (item.type === "CARE")
                    router.push({
                      pathname: "/care/detail",
                      params: { id: String(item.id), passportId: id },
                    });
                }}
              >
                <View style={styles.stamp}>
                  <Text style={styles.stampTop}>CARE</Text>
                  <Text style={styles.stampIcon}>♧</Text>
                </View>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordDate}>
                    {item.occurredAt.slice(0, 10).replaceAll("-", ". ")}
                  </Text>
                  <View style={styles.recordBody}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>{typeLabel(item)}</Text>
                    </View>
                    <Text numberOfLines={2} style={styles.recordTitle}>
                      {titleFor(item)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <AppButton outline title="여권 승계" onPress={() => setShowTransfer(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton
              title="＋ 기록 추가"
              onPress={() => router.push({ pathname: "/journey/add", params: { id } })}
            />
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={showTransfer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTransfer(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>승계하려는 제품이 맞나요?</Text>
            <Image source={bag} style={styles.modalBag} />
            <View style={styles.modalRule} />
            <View style={styles.modalProductRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalProductName}>
                  {passport.nickname || passport.modelName}
                </Text>
                <Text style={styles.modalMeta}>{passport.serialNumber} | cognac | L</Text>
                <Text style={styles.modalMeta}>
                  {passport.purchaseDate.replaceAll("-", ". ")} 개시
                </Text>
                <Text style={styles.modalDays}>
                  {daysSince(passport.purchaseDate)}일째 함께하고 있습니다
                </Text>
              </View>
              <View style={styles.grade}>
                <Text style={styles.gradeText}>
                  {currentGrade ? `등급 ${currentGrade}` : "진단 전"}
                </Text>
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalOutline}
                onPress={() => {
                  setShowTransfer(false);
                  router.push({ pathname: "/journey/transfer", params: { id } });
                }}
              >
                <Text style={styles.modalOutlineText}>네 맞습니다</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => setShowTransfer(false)}>
                <Text style={styles.modalPrimaryText}>아니요 이 제품이 아닙니다</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function daysSince(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return Math.max(0, Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000));
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 100 },
  title: { fontSize: 20, color: "#444", marginBottom: 14 },
  hero: {
    height: 160,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D6D6D6",
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBag: { width: "76%", height: "94%", resizeMode: "contain" },
  productHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#E7DED2",
  },
  productName: { fontSize: 14, color: "#444" },
  meta: { fontSize: 9, color: "#AAA", marginTop: 4 },
  grade: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 4, backgroundColor: "#F0F0F0" },
  gradeText: { fontSize: 9, color: "#777" },
  days: { height: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  smallDiamond: { fontSize: 7, color: colors.brown },
  daysText: { fontSize: 12, color: "#555" },
  timeline: { position: "relative", paddingBottom: 4 },
  timelineLine: {
    position: "absolute",
    left: 18,
    top: 22,
    bottom: 22,
    width: 1,
    backgroundColor: "#BDA078",
  },
  record: { minHeight: 70, flexDirection: "row", alignItems: "flex-start" },
  stamp: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: "#BDA078",
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stampTop: { fontSize: 6, color: colors.brown },
  stampIcon: { fontSize: 13, color: colors.brown },
  recordCopy: { flex: 1, paddingLeft: 10, paddingTop: 1 },
  recordDate: { fontSize: 8, color: "#A9A9A9", marginBottom: 4 },
  recordBody: { flexDirection: "row", alignItems: "center", gap: 7 },
  typeBadge: {
    minWidth: 39,
    height: 21,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: "#D5C2A5",
    borderRadius: 3,
    backgroundColor: "#F6EFE5",
    alignItems: "center",
    justifyContent: "center",
  },
  typeText: { fontSize: 8, color: "#80684A" },
  recordTitle: { flex: 1, fontSize: 9, color: "#5A5A5A", lineHeight: 13 },
  empty: { paddingLeft: 50, color: "#AAA", fontSize: 11 },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.48)",
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    backgroundColor: "#fff",
    padding: 20,
  },
  modalTitle: { fontSize: 16, color: "#444", marginBottom: 13 },
  modalBag: { width: "100%", height: 190, resizeMode: "contain" },
  modalRule: { height: 1, backgroundColor: "#D9CDBD", marginBottom: 15 },
  modalProductRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 4 },
  modalProductName: { fontSize: 14, color: "#444", marginBottom: 5 },
  modalMeta: { fontSize: 9, color: "#AAA", marginTop: 3 },
  modalDays: { fontSize: 11, color: "#555", marginTop: 5 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalOutline: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: "#BBB",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOutlineText: { fontSize: 10, color: "#555" },
  modalPrimary: {
    flex: 1,
    height: 46,
    borderRadius: 5,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: { fontSize: 10, color: "#fff" },
});
