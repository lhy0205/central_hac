import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useChrome } from "../context/ChromeContext";
import { ArIcon, DiagnosisIcon, HomeIcon, JourneyIcon, ProfileIcon } from "./TabIcons";

// 탭바는 두 곳에서 쓰인다.
//  - (tabs)/_layout.tsx  : 진짜 탭 네비게이터의 tabBar
//  - 스택으로 push된 화면 : 탭 네비게이터 밖이라 자동으로 안 뜨므로 BottomTabBar로 직접 그린다
// 두 경로가 절대 어긋나지 않도록 그리는 일은 TabBarView 하나만 한다.
export type TabKey = "home" | "ar" | "diagnosis" | "journey" | "profile";

export const TABS: { key: TabKey; label: string; path: string; Icon: typeof HomeIcon }[] = [
  { key: "home", label: "홈", path: "/(tabs)/home", Icon: HomeIcon },
  { key: "ar", label: "AR", path: "/(tabs)/ar", Icon: ArIcon },
  { key: "diagnosis", label: "진단", path: "/(tabs)/diagnosis", Icon: DiagnosisIcon },
  { key: "journey", label: "여권", path: "/(tabs)/journey", Icon: JourneyIcon },
  { key: "profile", label: "프로필", path: "/(tabs)/profile", Icon: ProfileIcon },
];

// 떠 있는 알약 모양이라 화면 콘텐츠가 이만큼은 아래를 비워둬야 가리지 않는다.
export const TAB_BAR_CLEARANCE = 96;

export function TabBarView({
  active,
  onPress,
}: {
  active: TabKey;
  onPress: (key: TabKey) => void;
}) {
  const insets = useSafeAreaInsets();
  const { tabBarHidden } = useChrome();
  const shift = useRef(new Animated.Value(0)).current;

  // 홈에서 배경을 스크롤하면 통째로 아래로 밀어 없앤다. 다시 맨 위로 오면 돌아온다.
  useEffect(() => {
    Animated.timing(shift, {
      toValue: tabBarHidden ? 1 : 0,
      duration: 280,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [shift, tabBarHidden]);

  const translateY = shift.interpolate({ inputRange: [0, 1], outputRange: [0, 140] });

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          bottom: Math.max(insets.bottom, 10),
          opacity: shift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ translateY }],
        },
      ]}
      pointerEvents={tabBarHidden ? "none" : "box-none"}
    >
      {TABS.map(({ key, label, Icon }) => {
        const center = key === "diagnosis";
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: key === active }}
            onPress={() => onPress(key)}
            style={({ pressed }) => [
              styles.item,
              center && styles.centerItem,
              !center && key === active && styles.activeItem,
              pressed && (center ? styles.centerPressed : styles.pressed),
            ]}
          >
            <Icon color={center ? "#FFFFFF" : "#2A2A2A"} focused={key === active} />
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

export function BottomTabBar({ active }: { active: TabKey }) {
  return (
    <TabBarView
      active={active}
      onPress={(key) => {
        if (key === active) return;
        const target = TABS.find((tab) => tab.key === key);
        if (target) router.replace(target.path as never);
      }}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    // 알약이 배경 영상 위에 떠 보이도록 그림자를 준다.
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  item: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  activeItem: { backgroundColor: "#F1F1F1" },
  pressed: { backgroundColor: "#EAEAEA", transform: [{ scale: 0.9 }] },
  centerItem: {
    width: 74,
    height: 74,
    borderRadius: 37,
    marginTop: -26,
    backgroundColor: "#0C0C0C",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  centerPressed: { backgroundColor: "#232323", transform: [{ scale: 0.92 }] },
});
