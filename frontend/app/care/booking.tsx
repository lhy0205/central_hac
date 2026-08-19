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

import {
  ApiError,
  reservationApi,
  storeApi,
  type CareRequestItemType,
  type StoreSummary,
} from "../../src/api/client";
import { Header } from "../../src/components/UI";
import { colors } from "../../src/theme";

// 백엔드 CareRequestItemType(LEATHER_CLEANING/METAL_POLISHING/STITCHING_REPAIR/OTHER)에 맞춘 화면 표시 라벨.
const REQUEST_OPTIONS: { label: string; value: CareRequestItemType }[] = [
  { label: "모서리 마모 보수", value: "STITCHING_REPAIR" },
  { label: "금속 부자재 광택", value: "METAL_POLISHING" },
  { label: "코팅 벗겨짐 복원", value: "OTHER" },
  { label: "전체 클리닝", value: "LEATHER_CLEANING" },
];
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}
function isPast(year: number, month: number, day: number, today: Date) {
  const cell = new Date(year, month, day);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return cell < start;
}

export default function CareBooking() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [now] = useState(new Date());
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storeId, setStoreId] = useState<number | null>(null);

  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [requests, setRequests] = useState<CareRequestItemType[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    storeApi
      .list()
      .then((page) => {
        if (!active) return;
        setStores(page.content);
        if (page.content.length > 0) setStoreId(page.content[0].id);
      })
      .catch(() => {})
      .finally(() => active && setStoresLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (storeId === null || selectedDate === null) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setSelectedSlot(null);
    reservationApi
      .availableSlots(String(storeId), dateKey(month.getFullYear(), month.getMonth(), selectedDate))
      .then((result) => active && setSlots(result))
      .catch(() => active && setSlots([]))
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [storeId, selectedDate, month]);

  function refreshSlots() {
    if (storeId === null || selectedDate === null) return;
    setSelectedSlot(null);
    reservationApi
      .availableSlots(String(storeId), dateKey(month.getFullYear(), month.getMonth(), selectedDate))
      .then(setSlots)
      .catch(() => setSlots([]));
  }

  const cells = useMemo(() => {
    const first = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as Array<
      number | null
    >;
  }, [month]);

  const canGoPrevMonth =
    month.getFullYear() > now.getFullYear() || month.getMonth() > now.getMonth();

  function move(delta: number) {
    if (delta < 0 && !canGoPrevMonth) return;
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
    setSelectedDate(null);
  }
  function toggle(value: CareRequestItemType) {
    setRequests((x) => (x.includes(value) ? x.filter((v) => v !== value) : [...x, value]));
  }

  async function submit() {
    if (!id) return Alert.alert("예약 확인", "예약할 제품 정보를 찾을 수 없습니다.");
    if (storeId === null) return Alert.alert("예약 확인", "매장을 선택해주세요.");
    if (!selectedSlot) return Alert.alert("예약 확인", "날짜와 시간을 선택해주세요.");
    if (requests.length === 0)
      return Alert.alert("예약 확인", "요청 항목을 한 개 이상 선택해주세요.");
    setSubmitting(true);
    try {
      const store = stores.find((s) => s.id === storeId);
      const reservation = await reservationApi.create(id, {
        storeId,
        slotDateTime: selectedSlot,
        requestItems: requests,
      });
      const dateLabel = `${selectedSlot.slice(0, 4)}. ${Number(selectedSlot.slice(5, 7))}. ${Number(selectedSlot.slice(8, 10))}`;
      const timeLabel = selectedSlot.slice(11, 16);
      Alert.alert(
        "예약 신청 완료",
        `${reservation.storeName || store?.name || ""}\n${dateLabel} ${timeLabel}\n매장에서 예약 확인 후 연락드립니다.`,
        [
          {
            text: "확인",
            onPress: () =>
              router.push({ pathname: "/journey/add", params: { id, type: "매장 방문" } }),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "예약 실패",
        error instanceof ApiError ? error.message : "예약 신청에 실패했습니다.",
      );
      // 다른 사용자가 그 사이 같은 슬롯을 먼저 예약했을 수 있음(백엔드 409 SLOT_ALREADY_BOOKED) — 목록을 새로 받아온다.
      if (error instanceof ApiError && error.status === 409) refreshSlots();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>공식 케어 예약</Text>
        <Text style={styles.caption}>
          매장 진단 이력은 자가진단보다 높은 신뢰도로 여권에 기록됩니다
        </Text>
        <View style={styles.rule} />

        <Text style={styles.section}>1. 매장 선택</Text>
        <View style={styles.map}>
          <Text style={styles.mapText}>지도</Text>
        </View>
        <View style={styles.storeBox}>
          <Text style={styles.storeLabel}>근처 매장</Text>
          {storesLoading ? (
            <ActivityIndicator color={colors.dark} />
          ) : stores.length === 0 ? (
            <Text style={styles.small}>예약 가능한 매장이 없습니다.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {stores.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setStoreId(s.id);
                    setSelectedDate(null);
                  }}
                  style={[styles.storeCard, storeId === s.id && styles.storeOn]}
                >
                  <View style={styles.storeHead}>
                    <Text style={styles.storeName}>{s.name}</Text>
                    <View style={[styles.radio, storeId === s.id && styles.radioOn]} />
                  </View>
                  <Text style={styles.small}>{s.address}</Text>
                  <Text style={styles.small}>
                    영업시간 {s.businessHoursStart?.slice(0, 5)}–{s.businessHoursEnd?.slice(0, 5)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        <Text style={styles.section}>2. 날짜와 시간</Text>
        <View style={styles.monthHead}>
          <Pressable onPress={() => move(-1)} disabled={!canGoPrevMonth}>
            <Text style={[styles.arrow, !canGoPrevMonth && styles.arrowDisabled]}>‹</Text>
          </Pressable>
          <Text style={styles.month}>
            {month.getFullYear()}. {pad(month.getMonth() + 1)}
          </Text>
          <Pressable onPress={() => move(1)}>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>
        <View style={styles.week}>
          {WEEK.map((d, i) => (
            <Text key={d} style={[styles.weekText, i === 0 && { color: "#C86666" }]}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.calendar}>
          {cells.map((day, index) => {
            if (day === null) return <View key={`blank-${index}`} style={styles.day} />;
            const past = isPast(month.getFullYear(), month.getMonth(), day, now);
            return (
              <Pressable
                key={day}
                disabled={past}
                onPress={() => setSelectedDate(day)}
                style={[styles.day, selectedDate === day && styles.dayOn]}
              >
                <Text
                  style={[
                    styles.dayText,
                    index % 7 === 0 && { color: "#C86666" },
                    past && styles.dayTextDisabled,
                    selectedDate === day && styles.dayTextOn,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.timeLabel}>시간</Text>
        {selectedDate === null ? (
          <Text style={styles.small}>날짜를 먼저 선택해주세요.</Text>
        ) : slotsLoading ? (
          <ActivityIndicator color={colors.dark} />
        ) : slots.length === 0 ? (
          <Text style={styles.small}>선택한 날짜에 예약 가능한 시간이 없습니다.</Text>
        ) : (
          <View style={styles.timeGrid}>
            {slots.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => setSelectedSlot(slot)}
                style={[styles.time, selectedSlot === slot && styles.timeOn]}
              >
                <Text style={[styles.timeText, selectedSlot === slot && styles.timeTextOn]}>
                  {slot.slice(11, 16)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.section}>3. 요청 항목</Text>
        <View style={styles.requests}>
          <Text style={styles.requestCaption}>해당하는 항목을 선택해주세요</Text>
          <View style={styles.requestGrid}>
            {REQUEST_OPTIONS.map((r) => (
              <Pressable key={r.value} style={styles.requestRow} onPress={() => toggle(r.value)}>
                <View style={[styles.checkbox, requests.includes(r.value) && styles.checkboxOn]}>
                  {requests.includes(r.value) && (
                    <Text style={{ color: "#fff", fontSize: 10 }}>✓</Text>
                  )}
                </View>
                <Text style={styles.requestText}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={[styles.primary, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={submit}
        >
          <Text style={styles.primaryText}>{submitting ? "신청 중..." : "예약 신청하기"}</Text>
        </Pressable>
        <Text style={styles.bottomCaption}>신청 후 매장에서 최종 연락을 드립니다</Text>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 45 },
  title: { fontSize: 20, color: "#333", marginTop: 8 },
  caption: { fontSize: 9, color: "#AAA", marginTop: 5 },
  rule: { height: 1, backgroundColor: "#E9E9E9", marginVertical: 18 },
  section: { fontSize: 12, color: "#444", marginBottom: 13, marginTop: 2 },
  map: { height: 130, backgroundColor: "#DDD", alignItems: "center", justifyContent: "center" },
  mapText: { fontSize: 13, color: "#666" },
  storeBox: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 6,
    padding: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  storeLabel: { fontSize: 10, color: "#666", marginBottom: 8 },
  storeCard: {
    width: 170,
    minHeight: 79,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 5,
    padding: 10,
  },
  storeOn: { borderColor: "#777" },
  storeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  storeName: { fontSize: 10, color: "#444" },
  radio: { width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: "#BBB" },
  radioOn: { borderWidth: 4, borderColor: "#555" },
  small: { fontSize: 8, color: "#999", marginTop: 5 },
  monthHead: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14 },
  month: { fontSize: 14, fontWeight: "700" },
  arrow: { fontSize: 24, color: "#777" },
  arrowDisabled: { color: "#DDD" },
  week: { flexDirection: "row", marginTop: 14 },
  weekText: { width: "14.285%", textAlign: "center", fontSize: 10, color: "#666" },
  calendar: { flexDirection: "row", flexWrap: "wrap", marginTop: 5 },
  day: {
    width: "14.285%",
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  dayOn: { backgroundColor: colors.dark },
  dayText: { fontSize: 10, color: "#444" },
  dayTextDisabled: { color: "#DDD" },
  dayTextOn: { color: "#fff" },
  timeLabel: { fontSize: 10, color: "#777", marginTop: 14, marginBottom: 8 },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  time: {
    width: "22.8%",
    height: 31,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  timeOn: { backgroundColor: colors.dark, borderColor: colors.dark },
  timeText: { fontSize: 9, color: "#555" },
  timeTextOn: { color: "#fff" },
  requests: { borderWidth: 1, borderColor: "#DDD", borderRadius: 6, padding: 12, marginBottom: 22 },
  requestCaption: { fontSize: 8, color: "#AAA", marginBottom: 9 },
  requestGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 9 },
  requestRow: { width: "50%", flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#444", borderColor: "#444" },
  requestText: { fontSize: 9, color: "#555" },
  primary: {
    height: 48,
    borderRadius: 3,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 11 },
  bottomCaption: { textAlign: "center", fontSize: 8, color: "#AAA", marginTop: 9 },
});
