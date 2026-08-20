import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../../src/components/BrandText";

import {
  ApiError,
  reservationApi,
  storeApi,
  type CareRequestItemType,
  type StoreSummary,
} from "../../src/api/client";
import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { Calendar } from "../../src/components/Calendar";
import { Header } from "../../src/components/UI";
import { colors } from "../../src/theme";

const REQUEST_OPTIONS: { label: string; value: CareRequestItemType }[] = [
  { label: "모서리 마모 보수", value: "STITCHING_REPAIR" },
  { label: "금속 부자재 광택", value: "METAL_POLISHING" },
  { label: "코팅 벗겨짐 복원", value: "OTHER" },
  { label: "전체 클리닝", value: "LEATHER_CLEANING" },
];

const STORE_CARD_WIDTH = Dimensions.get("window").width * 0.78;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function CareBooking() {
  const bottomPad = useTabBarClearance(20);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storeId, setStoreId] = useState<number | null>(null);

  const [date, setDate] = useState<string | null>(null);
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
    if (storeId === null || date === null) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setSelectedSlot(null);
    reservationApi
      .availableSlots(String(storeId), date)
      .then((result) => active && setSlots(result))
      .catch(() => active && setSlots([]))
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [storeId, date]);

  function refreshSlots() {
    if (storeId === null || date === null) return;
    setSelectedSlot(null);
    reservationApi
      .availableSlots(String(storeId), date)
      .then(setSlots)
      .catch(() => setSlots([]));
  }

  function toggle(value: CareRequestItemType) {
    setRequests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function submit() {
    if (!id) return Alert.alert("예약 확인", "예약할 제품 정보를 찾을 수 없습니다.");
    if (storeId === null) return Alert.alert("예약 확인", "매장을 선택해주세요.");
    if (!selectedSlot) return Alert.alert("예약 확인", "날짜와 시간을 선택해주세요.");
    if (requests.length === 0)
      return Alert.alert("예약 확인", "요청 항목을 한 개 이상 선택해주세요.");
    setSubmitting(true);
    try {
      const store = stores.find((item) => item.id === storeId);
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

      if (error instanceof ApiError && error.status === 409) refreshSlots();
    } finally {
      setSubmitting(false);
    }
  }

  const morning = slots.filter((slot) => Number(slot.slice(11, 13)) < 12);
  const afternoon = slots.filter((slot) => Number(slot.slice(11, 13)) >= 12);

  return (
    <View style={styles.screen}>
      <Header title="공식 케어 예약" back hideProfile />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>공식 케어 예약</Text>
        <View style={styles.rule} />

        <Text style={styles.section}>1. 매장 선택</Text>
        <View style={styles.map}>
          <Text style={styles.mapText}>지도</Text>
        </View>
        <Text style={styles.storeLabel}>근처 매장</Text>
        {storesLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : stores.length === 0 ? (
          <Text style={styles.empty}>예약 가능한 매장이 없습니다.</Text>
        ) : (
          <FlatList
            data={stores}
            keyExtractor={(item) => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={STORE_CARD_WIDTH + 10}
            decelerationRate="fast"
            contentContainerStyle={styles.storeRail}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setStoreId(item.id)}
                style={[styles.storeCard, storeId === item.id && styles.storeCardOn]}
              >
                <View style={styles.storeHead}>
                  <Text style={styles.storeName}>{item.name}</Text>
                  <View style={[styles.storeDot, storeId === item.id && styles.storeDotOn]} />
                </View>
                <Text style={styles.storeSmall}>{item.address}</Text>
                <Text style={styles.storeSmall}>
                  {item.businessHoursStart?.slice(0, 5)} - {item.businessHoursEnd?.slice(0, 5)}
                </Text>
                <Text style={styles.storeSmall}>{item.slotLengthMinutes}분 단위 예약</Text>
              </Pressable>
            )}
          />
        )}

        <Text style={styles.section}>2. 날짜와 시간</Text>
        <Calendar disabledDates={(iso) => iso < todayIso()} onSelect={setDate} value={date} />

        {date == null ? (
          <Text style={styles.empty}>날짜를 먼저 선택해주세요.</Text>
        ) : slotsLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : slots.length === 0 ? (
          <Text style={styles.empty}>선택한 날짜에 예약 가능한 시간이 없습니다.</Text>
        ) : (
          <>
            {morning.length > 0 ? (
              <>
                <Text style={styles.timeLabel}>오전</Text>
                <View style={styles.slots}>
                  {morning.map((slot) => (
                    <Pressable
                      key={slot}
                      onPress={() => setSelectedSlot(slot)}
                      style={[styles.slot, selectedSlot === slot && styles.slotOn]}
                    >
                      <Text style={[styles.slotText, selectedSlot === slot && styles.slotTextOn]}>
                        {slot.slice(11, 16)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {afternoon.length > 0 ? (
              <>
                <Text style={styles.timeLabel}>오후</Text>
                <View style={styles.slots}>
                  {afternoon.map((slot) => (
                    <Pressable
                      key={slot}
                      onPress={() => setSelectedSlot(slot)}
                      style={[styles.slot, selectedSlot === slot && styles.slotOn]}
                    >
                      <Text
                        style={[
                          styles.slotText,
                          styles.slotPm,
                          selectedSlot === slot && styles.slotTextOn,
                        ]}
                      >
                        {slot.slice(11, 16)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}

        <Text style={styles.section}>3. 요청 항목</Text>
        <View style={styles.items}>
          {REQUEST_OPTIONS.map((option) => {
            const on = requests.includes(option.value);
            return (
              <Pressable
                key={option.value}
                onPress={() => toggle(option.value)}
                style={styles.item}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.itemLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          disabled={submitting}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{submitting ? "신청 중..." : "예약 신청하기"}</Text>
        </Pressable>
        <Text style={styles.caption}>신청 후 매장에서 확정 연락을 드립니다</Text>
      </ScrollView>

      <BottomTabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 21, fontWeight: "800", color: "#111" },
  rule: { height: 1, backgroundColor: "#DEDEDE", marginTop: 18, marginBottom: 4 },
  section: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginTop: 24, marginBottom: 12 },
  map: {
    height: 130,
    borderRadius: 4,
    backgroundColor: "#D9D9D9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  mapText: { fontSize: 12.5, color: "#7A7A7A" },
  storeLabel: { fontSize: 11.5, color: "#666", marginBottom: 8 },
  storeRail: { gap: 10 },
  storeCard: {
    width: STORE_CARD_WIDTH,
    borderWidth: 1,
    borderColor: "#E3DED4",
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#fff",
  },
  storeCardOn: { borderColor: "#8A5A20", backgroundColor: "#FDFAF4" },
  storeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  storeName: { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  storeDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#DEDEDE" },
  storeDotOn: { backgroundColor: "#B8862B" },
  storeSmall: { fontSize: 11, color: "#9A9A9A", marginBottom: 3 },

  loading: { paddingVertical: 20 },
  empty: { fontSize: 12, color: "#9A9A9A", paddingVertical: 14 },
  timeLabel: { fontSize: 11.5, color: "#666", marginTop: 18, marginBottom: 9 },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: {
    minWidth: "22%",
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
  },
  slotOn: { backgroundColor: "#8A5A20", borderColor: "#8A5A20" },
  slotText: { fontSize: 12, color: "#333" },
  slotPm: { color: "#5B7BB8" },
  slotTextOn: { color: "#fff", fontWeight: "600" },

  items: { flexDirection: "row", flexWrap: "wrap", rowGap: 14, columnGap: 12 },
  item: { width: "46%", flexDirection: "row", alignItems: "center", gap: 9 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#D5D0C7",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#7A4E15", borderColor: "#7A4E15" },
  check: { color: "#fff", fontSize: 11 },
  itemLabel: { fontSize: 12, color: "#333" },

  cta: {
    height: 62,
    borderRadius: 10,
    backgroundColor: "#7A4E15",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },
  ctaPressed: { backgroundColor: "#8F5D1D", transform: [{ scale: 0.98 }] },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  caption: { fontSize: 11, color: "#B0B0B0", textAlign: "center", marginTop: 12 },
});
