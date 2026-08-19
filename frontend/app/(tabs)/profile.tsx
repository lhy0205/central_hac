import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { accountApi, type AccountInfo } from "../../src/api/client";
import { useTabBarClearance } from "../../src/components/BottomTabBar";
import { Header } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";

const ACCOUNT_ROWS = [
  { label: "회원정보 변경", path: "/profile/account" },
  { label: "권한 설정", path: "/profile/notifications" },
  { label: "약관 및 개인정보 처리방침", path: "/profile/legal" },
];

export default function Profile() {
  const bottomPad = useTabBarClearance(20);
  const auth = useAuth();
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      accountApi
        .me()
        .then((info) => active && setAccount(info))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  function logout() {
    Alert.alert("로그아웃", "로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          await auth.logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
        <Text style={styles.title}>프로필</Text>

        <View style={styles.card}>
          <View style={styles.avatar} />
          <View style={styles.me}>
            <Text style={styles.nickname}>{account?.nickname ?? "닉네임"}</Text>
            <Text style={styles.email}>{account?.email ?? "-"}</Text>
          </View>
          <Pressable
            onPress={logout}
            style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>

        <Text style={styles.group}>계정</Text>
        <View style={styles.rows}>
          {ACCOUNT_ROWS.map((row) => (
            <Pressable
              key={row.label}
              onPress={() => router.push(row.path as never)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.group}>지원</Text>
        <View style={styles.rows}>
          <Pressable
            onPress={() => router.push("/profile/support")}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowLabel}>고객센터</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F7F7" },
  content: { padding: 16 },
  title: { fontSize: 17, fontWeight: "700", color: "#1A1A1A", marginBottom: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EDEDED",
    padding: 16,
    marginBottom: 22,
  },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#9A6B3C" },
  me: { flex: 1 },
  nickname: { fontSize: 13.5, color: "#1A1A1A", marginBottom: 5 },
  email: { fontSize: 11.5, color: "#9A9A9A", textDecorationLine: "underline" },
  logout: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: "#3A3A3A",
    justifyContent: "center",
  },
  logoutText: { color: "#fff", fontSize: 11.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },

  group: { fontSize: 11, color: "#A0A0A0", marginBottom: 8, marginLeft: 4 },
  rows: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EDEDED",
    overflow: "hidden",
    marginBottom: 22,
  },
  row: {
    height: 52,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F2",
  },
  rowPressed: { backgroundColor: "#FAFAFA" },
  rowLabel: { fontSize: 13, color: "#2A2A2A" },
  chevron: { fontSize: 15, color: "#C4C4C4" },
});
