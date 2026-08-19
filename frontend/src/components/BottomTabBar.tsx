import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../theme";
import { ArIcon, DiagnosisIcon, HomeIcon, JourneyIcon, ProfileIcon } from "./TabIcons";

// (tabs)/_layout.tsx의 탭바를 화면 밖(스택으로 push된 화면, 예: journey/passport.tsx)에서도
// 똑같이 보여주기 위한 대체 컴포넌트. 실제 Tabs 네비게이터 밖이라 진짜 탭바는 자동으로 안 뜨므로,
// 같은 아이콘(TabIcons)으로 5개 탭 이동 버튼 행을 직접 그린다.
type TabKey = "home" | "ar" | "diagnosis" | "journey" | "profile";
const TABS: { key: TabKey; label: string; path: string; Icon: typeof HomeIcon }[] = [
  { key: "home", label: "홈", path: "/(tabs)/home", Icon: HomeIcon },
  { key: "ar", label: "AR", path: "/(tabs)/ar", Icon: ArIcon },
  { key: "diagnosis", label: "진단", path: "/(tabs)/diagnosis", Icon: DiagnosisIcon },
  { key: "journey", label: "여권", path: "/(tabs)/journey", Icon: JourneyIcon },
  { key: "profile", label: "프로필", path: "/(tabs)/profile", Icon: ProfileIcon },
];

export function BottomTabBar({ active }: { active: TabKey }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { height: 78 + insets.bottom, paddingBottom: Math.max(insets.bottom, 7) },
      ]}
    >
      {TABS.map(({ key, label, path, Icon }) => (
        <Pressable
          key={key}
          style={styles.item}
          accessibilityLabel={label}
          onPress={() => {
            if (key !== active) router.replace(path as never);
          }}
        >
          <View style={key === "diagnosis" && styles.diagnosisIconWrap}>
            <Icon color={colors.brown} focused={key === active} />
          </View>
          <Text style={[styles.label, key === "diagnosis" && styles.diagnosisLabel]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ECE7E0",
    backgroundColor: "#FFFFFF",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  label: { fontSize: 10, marginTop: 4, color: colors.brown },
  diagnosisIconWrap: { marginTop: -16 },
  diagnosisLabel: { marginTop: 7 },
});
