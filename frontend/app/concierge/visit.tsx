import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { reservationApi, storeApi, type StoreSummary } from "../../src/api/client";
import { BottomTabBar, useTabBarClearance } from "../../src/components/BottomTabBar";
import { Calendar } from "../../src/components/Calendar";
import { Header } from "../../src/components/UI";
import { colors } from "../../src/theme";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/* 매장 방문 예약 — Concierge(구매 전)에서 "매장에서 보기"로 들어온다.

   케어 예약(care/booking)과는 다른 일이다. 케어 예약은 이미 가진 제품을 맡기는 것이라
   passportId가 필요하지만, 여기 오는 사람은 아직 그 제품을 사지 않았다. 그래서 케어 예약
   화면으로 보내면 애초에 성립하지 않는다.

   매장 목록과 예약 가능 시간은 실제 API를 그대로 쓴다(둘 다 passportId가 필요 없다).
   다만 "방문 예약"을 저장할 엔드포인트는 백엔드에 아직 없어서 확정은 화면에서 끝난다 —
   기획서가 Concierge를 프런트엔드 전용으로 잡아둔 범위와 같다. */
export default function StoreVisit() {
  const bottomPad = useTabBarClearance(20);
  const { model } = useLocalSearchParams<{ model?: string }>();

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);

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
      setSlot(null);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    reservationApi
      .availableSlots(String(storeId), date)
      .then((list) => active && setSlots(list))
      .catch(() => active && setSlots([]))
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [date, storeId]);

  const store = stores.find((item) => item.id === storeId);

  function confirm() {
    if (storeId === null || date === null || slot === null) {
      return Alert.alert("확인", "매장과 날짜, 시간을 모두 선택해주세요.");
    }
    Alert.alert(
      "방문 예약 완료",
      `${store?.name ?? "매장"}\n${date.replaceAll("-", ". ")} ${slot.slice(11, 16)}\n\n${
        model ? `${model}을(를) ` : ""
      }준비해 두겠습니다.`,
      [{ text: "확인", onPress: () => router.back() }],
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="매장 방문 예약" back hideProfile />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>매장에서 직접 보기</Text>
        {model ? <Text style={styles.lead}>{model}</Text> : null}
        <Text style={styles.guide}>
          방문하시면 실물을 준비해 두고, 원하시면 그 자리에서 여권도 만들어 드립니다.
        </Text>
        <View style={styles.rule} />

        <Text style={styles.section}>1. 매장 선택</Text>
        {storesLoading ? (
          <ActivityIndicator style={styles.loading} />
        ) : stores.length === 0 ? (
          <Text style={styles.empty}>방문 가능한 매장이 없습니다.</Text>
        ) : (
          <FlatList
            data={stores}
            keyExtractor={(item) => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setStoreId(item.id)}
                style={[styles.storeCard, storeId === item.id && styles.storeCardOn]}
              >
                <View style={styles.storeHead}>
                  <Text numberOfLines={1} style={styles.storeName}>
                    {item.name}
                  </Text>
                  <View style={[styles.storeDot, storeId === item.id && styles.storeDotOn]} />
                </View>
                <Text numberOfLines={2} style={styles.storeSmall}>
                  {item.address}
                </Text>
                <Text style={styles.storeSmall}>
                  {item.businessHoursStart?.slice(0, 5)} - {item.businessHoursEnd?.slice(0, 5)}
                </Text>
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
          <Text style={styles.empty}>선택한 날짜에 방문 가능한 시간이 없습니다.</Text>
        ) : (
          <View style={styles.slots}>
            {slots.map((item) => (
              <Pressable
                key={item}
                onPress={() => setSlot(item)}
                style={[styles.slot, slot === item && styles.slotOn]}
              >
                <Text style={[styles.slotText, slot === item && styles.slotTextOn]}>
                  {item.slice(11, 16)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          onPress={confirm}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>방문 예약하기</Text>
        </Pressable>
      </ScrollView>

      <BottomTabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 21, fontWeight: "500", color: "#2F2F2F" },
  lead: { fontSize: 13, color: colors.brown, marginTop: 7, fontWeight: "600" },
  guide: { fontSize: 12, color: colors.muted, lineHeight: 19, marginTop: 8 },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  section: { fontSize: 15, fontWeight: "600", color: "#2F2F2F", marginTop: 12, marginBottom: 10 },
  loading: { marginVertical: 16 },
  empty: { fontSize: 12, color: colors.muted, marginVertical: 12 },

  rail: { gap: 10, paddingRight: 4 },
  storeCard: {
    width: 190,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    padding: 12,
    gap: 4,
    backgroundColor: "#fff",
  },
  storeCardOn: { borderColor: colors.brown, backgroundColor: "#FBF7F0" },
  storeHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  storeName: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  storeDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: "#C9C9C9" },
  storeDotOn: { backgroundColor: colors.brown, borderColor: colors.brown },
  storeSmall: { fontSize: 11, color: "#7A7A7A", lineHeight: 16 },

  slots: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  slot: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  slotOn: { backgroundColor: "#111", borderColor: "#111" },
  slotText: { fontSize: 12.5, color: "#333" },
  slotTextOn: { color: "#fff", fontWeight: "600" },

  cta: {
    height: 52,
    borderRadius: 8,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.85 },
});
