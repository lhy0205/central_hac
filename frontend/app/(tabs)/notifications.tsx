import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../../src/components/BrandText";
import {
  notificationApi,
  productApi,
  type CareNotification,
  type NotificationType,
} from "../../src/api/client";
import { useTabBarClearance } from "../../src/components/BottomTabBar";
import { ReasonChips } from "../../src/components/ReasonChips";
import { Header } from "../../src/components/UI";
import { colors } from "../../src/theme";

const META: Record<NotificationType, { label: string }> = {
  SELF_CARE: { label: "케어" },
  STORE_SERVICE: { label: "진단" },
  REPURCHASE: { label: "교체" },
  MILESTONE: { label: "기념" },
};
function dateText(value: string) {
  return value.slice(0, 10).replaceAll("-", ". ");
}
export default function Notifications() {
  const bottomPad = useTabBarClearance(20);
  const [items, setItems] = useState<CareNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const passports = await productApi.list(0, 100);
      const pages = await Promise.all(
        passports.content.map((passport) => notificationApi.list(String(passport.id), 0, 100)),
      );
      setItems(
        pages
          .flatMap((page) => page.content)
          .filter((item) => !item.dismissed)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const visible = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.read) : items),
    [filter, items],
  );
  async function open(item: CareNotification) {
    if (item.read) return;
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
    );
    try {
      await notificationApi.markRead(String(item.id));
    } catch {}
  }
  function dismiss(item: CareNotification) {
    Alert.alert("알림 삭제", "이 알림을 목록에서 숨길까요?", [
      { text: "취소" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await notificationApi.dismiss(String(item.id));
            setItems((current) => current.filter((entry) => entry.id !== item.id));
          } catch {
            Alert.alert("삭제 실패", "알림을 삭제하지 못했습니다.");
          }
        },
      },
    ]);
  }
  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.filters}>
        <Pressable
          onPress={() => setFilter("all")}
          style={[styles.filter, filter === "all" && styles.filterOn]}
        >
          <Text style={filter === "all" ? styles.filterTextOn : styles.filterText}>
            전체 {items.length}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter("unread")}
          style={[styles.filter, filter === "unread" && styles.filterOn]}
        >
          <Text style={filter === "unread" ? styles.filterTextOn : styles.filterText}>
            읽지 않음 {items.filter((item) => !item.read).length}
          </Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brown} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {visible.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>새로운 알림이 없습니다</Text>
              <Text style={styles.sub}>케어와 여권 소식이 생기면 알려드릴게요.</Text>
            </View>
          ) : (
            visible.map((item) => {
              const meta = META[item.type];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => open(item)}
                  onLongPress={() => dismiss(item)}
                  style={[styles.row, item.read && styles.read]}
                >
                  <Text style={styles.diamond}>◆</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{meta.label}</Text>
                      </View>
                      <Text style={styles.date}>{dateText(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.message}>
                      {item.message}
                      {item.overallScore != null ? ` · 종합 ${item.overallScore}점` : ""}
                    </Text>
                    <ReasonChips factors={item.reasonFactors} />
                    <Text style={styles.hint}>길게 눌러 삭제</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  filters: { flexDirection: "row", gap: 8, padding: 18, paddingBottom: 8 },
  filter: {
    height: 30,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderRadius: 16,
    justifyContent: "center",
  },
  filterOn: { backgroundColor: "#414141", borderColor: "#414141" },
  filterText: { fontSize: 11, color: "#929292" },
  filterTextOn: { fontSize: 11, color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20 },
  row: {
    minHeight: 105,
    flexDirection: "row",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },
  read: { opacity: 0.62 },
  diamond: { width: 20, paddingTop: 9, color: colors.brown, fontSize: 8 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    minWidth: 51,
    height: 22,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#b99b73",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8d3b3",
  },
  badgeText: { color: "#715638", fontSize: 10 },
  date: { color: "#bababa", fontSize: 9 },
  message: { marginTop: 5, color: "#343434", fontSize: 13, lineHeight: 19 },
  sub: { marginTop: 2, color: "#aaa", fontSize: 9, lineHeight: 14 },
  hint: { marginTop: 4, color: "#c1c1c1", fontSize: 8 },
  empty: { alignItems: "center", paddingTop: 110 },
  emptyTitle: { color: "#444", fontSize: 15, marginBottom: 8 },
});
