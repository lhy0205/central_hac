import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "./BrandText";

import {
  notificationApi,
  productApi,
  type CareNotification,
  type NotificationType,
} from "../api/client";
import { ReasonChips } from "./ReasonChips";
import { colors } from "../theme";

/* 홈 헤더의 알림 아이콘을 누르면 벨 아래에서 말풍선으로 내려온다.
   내용은 기존 (tabs)/notifications.tsx와 같은 값을 쓴다 — 타입 라벨은 META, 본문은
   백엔드가 만들어 내려주는 message, 판단 근거는 reasonFactors, 날짜는 createdAt. */
const META: Record<NotificationType, { label: string }> = {
  SELF_CARE: { label: "케어" },
  STORE_SERVICE: { label: "진단" },
  REPURCHASE: { label: "교체" },
  MILESTONE: { label: "기념" },
};

type Row = CareNotification & { serialNumber: string | null };

function dateText(value: string) {
  return value.slice(0, 10).replaceAll("-", ". ");
}

export function NotificationBubble({
  open,
  onClose,
  topOffset,
}: {
  open: boolean;
  onClose: () => void;
  topOffset: number;
}) {
  const [items, setItems] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const pop = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pop, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 160,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
    if (open) drag.setValue(0);
  }, [drag, open, pop]);

  const load = useCallback(async () => {
    try {
      const passports = await productApi.list(0, 100);
      const pages = await Promise.all(
        passports.content.map(async (passport) => {
          const [page, detail] = await Promise.all([
            notificationApi.list(String(passport.id), 0, 100),
            productApi.detail(String(passport.id)).catch(() => null),
          ]);
          return page.content.map((item) => ({
            ...item,
            serialNumber: detail?.serialNumber ?? null,
          }));
        }),
      );
      setItems(
        pages
          .flat()
          .filter((item) => !item.dismissed)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (open && items == null) void load();
  }, [items, load, open]);

  // 위로 밀어 올리면 닫힌다. 목록이 스크롤 가능한 상태에서는 칩/손잡이에서 끌면 된다.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy < -6,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy < 0) drag.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -40) onClose();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (!open) return null;

  const rows = (items ?? []).filter((item) => filter === "all" || !item.read);
  const unread = (items ?? []).filter((item) => !item.read).length;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="알림 닫기"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      />
      <Animated.View
        style={[
          styles.bubble,
          {
            top: topOffset,
            opacity: pop,
            transform: [
              { translateY: drag },
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.tail} />
        <View style={styles.chips} {...panResponder.panHandlers}>
          <Pressable
            onPress={() => setFilter("all")}
            style={[styles.chip, filter === "all" && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === "all" && styles.chipTextOn]}>
              전체 {items?.length ?? 0}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFilter("unread")}
            style={[styles.chip, filter === "unread" && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === "unread" && styles.chipTextOn]}>
              읽지 않음 {unread}
            </Text>
          </Pressable>
        </View>

        {items == null ? (
          <View style={styles.state}>
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.emptyTitle}>새로운 알림이 없습니다</Text>
            <Text style={styles.sub}>케어와 여권 소식이 생기면 알려드릴게요.</Text>
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {rows.map((item) => {
              const meta = META[item.type];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    void notificationApi.markRead(String(item.id)).catch(() => {});
                    setItems(
                      (prev) =>
                        prev?.map((row) => (row.id === item.id ? { ...row, read: true } : row)) ??
                        prev,
                    );
                  }}
                  style={[styles.row, !item.read && styles.rowUnread]}
                >
                  <Text style={styles.diamond}>◆</Text>
                  <View style={styles.rowBody}>
                    <View style={styles.rowHead}>
                      <Text style={styles.badge}>{meta.label}</Text>
                      <Text style={styles.when}>{dateText(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.message}>
                      {item.message}
                      {item.overallScore != null ? ` · 종합 ${item.overallScore}점` : ""}
                    </Text>
                    {item.serialNumber ? <Text style={styles.sub}>{item.serialNumber}</Text> : null}
                    <ReasonChips factors={item.reasonFactors} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable accessibilityLabel="알림 닫기" onPress={onClose} style={styles.gripWrap}>
          <View style={styles.grip} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(70,70,70,0.46)" },
  bubble: {
    position: "absolute",
    left: 8,
    right: 8,
    maxHeight: "62%",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingTop: 12,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  // 벨 아이콘을 가리키는 꼬리. 사각형을 45도 돌려 삼각형처럼 보이게 한다.
  tail: {
    position: "absolute",
    top: -6,
    right: 25,
    width: 14,
    height: 14,
    backgroundColor: "#fff",
    borderRadius: 3,
    transform: [{ rotate: "45deg" }],
  },
  chips: { flexDirection: "row", gap: 7, paddingHorizontal: 12, paddingBottom: 11 },
  chip: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 12, color: "#333" },
  chipTextOn: { color: "#fff", fontWeight: "500" },
  list: { flexGrow: 0 },
  state: { paddingVertical: 30, alignItems: "center", gap: 7 },
  emptyTitle: { fontSize: 13.5, color: "#444" },
  row: {
    flexDirection: "row",
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  rowUnread: { backgroundColor: "#E9EDFA" },
  diamond: { color: "#8A6A3E", fontSize: 8.5, lineHeight: 17 },
  rowBody: { flex: 1 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    minWidth: 46,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#B99B73",
    borderRadius: 4,
    color: "#8A6A3E",
    fontSize: 10,
    lineHeight: 18,
  },
  when: { flex: 1, textAlign: "right", fontSize: 10.5, color: "#A8A8A8" },
  message: { fontSize: 12.5, color: "#343434", lineHeight: 18, marginTop: 5 },
  sub: { fontSize: 11, color: "#8E8E8E", marginTop: 4, lineHeight: 16 },
  gripWrap: { paddingVertical: 8, alignItems: "center" },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#DCDCDC" },
});
