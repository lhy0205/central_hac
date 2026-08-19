import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { accountApi, type AccountInfo } from "../../src/api/client";
import { Header } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme";
// 멤버십 연동 API가 아직 없어 공식 홈페이지로 넘긴다. 외부 브라우저로 열린다.
const MCM_OFFICIAL_URL = "https://www.mcmworldwide.com/ko-kr";
async function openMembership() {
  try {
    await Linking.openURL(MCM_OFFICIAL_URL);
  } catch {
    Alert.alert("이동 실패", "브라우저를 열 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
}
type MenuRowProps = { label: string; onPress: () => void; badge?: string };
function MenuRow({ label, onPress, badge }: MenuRowProps) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Text style={styles.menuLabel}>{label}</Text>
      <View style={styles.menuRight}>
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}
export default function Profile() {
  const { logout } = useAuth();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      accountApi
        .me()
        .then((value) => {
          if (active) setAccount(value);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );
  function handleLogout() {
    Alert.alert("로그아웃", "로그아웃하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }
  return (
    <View style={styles.screen}>
      <Header hideProfile />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 서버 주소 재정의 화면으로 가는 숨은 진입점 — 데모 중 주소가 틀어졌을 때
            앱을 재설치하지 않고 고치기 위한 비상구다. 일반 사용자가 실수로 열지 않도록
            길게 누르기로만 열린다(src/config/serverAddress.ts 주석 참고). */}
        <Text style={styles.title} onLongPress={() => router.push("/dev/server")}>
          프로필
        </Text>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(account?.nickname || "닉").slice(0, 1)}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.nickname}>{account?.nickname || "닉네임"}</Text>
            <Text style={styles.email}>{account?.email || "user@example.com"}</Text>
          </View>
        </View>
        <Text style={styles.sectionLabel}>계정</Text>
        <View style={styles.menuGroup}>
          <MenuRow label="회원정보 변경" onPress={() => router.push("/profile/account")} />
          <MenuRow label="권한 설정" onPress={() => router.push("/profile/notifications")} />
          <MenuRow label="MCM 멤버십 연동" badge="미연동" onPress={openMembership} />
        </View>
        <Text style={styles.sectionLabel}>지원</Text>
        <View style={styles.menuGroup}>
          <MenuRow label="고객센터" onPress={() => router.push("/profile/support")} />
          <MenuRow
            label="약관 및 개인정보 처리방침"
            onPress={() => router.push("/profile/legal")}
          />
        </View>
        <View style={styles.flexSpacer} />
        <Pressable style={styles.logout} onPress={handleLogout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: "#fff",
    flexGrow: 1,
  },
  title: { fontSize: 16, color: "#444", marginBottom: 14 },
  profileCard: {
    height: 100,
    borderRadius: 9,
    backgroundColor: "#F7F7F7",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#D8D8D8",
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, color: "#999" },
  profileCopy: { marginLeft: 15 },
  nickname: { fontSize: 13, color: "#444", marginBottom: 7 },
  email: { fontSize: 10, color: "#999", textDecorationLine: "underline" },
  sectionLabel: { fontSize: 10, color: "#999", marginTop: 22, marginBottom: 9 },
  menuGroup: {
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  menuRow: {
    height: 58,
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuLabel: { fontSize: 12, color: "#444" },
  menuRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    height: 23,
    minWidth: 54,
    paddingHorizontal: 9,
    borderRadius: 5,
    backgroundColor: "#F1F1F1",
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 9, color: "#888" },
  chevron: { fontSize: 17, color: "#BBB" },
  flexSpacer: { flex: 1, minHeight: 58 },
  logout: {
    height: 48,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  logoutText: { fontSize: 12, color: "#444" },
});
