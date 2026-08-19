import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../../src/theme";
import {
  ArIcon,
  DiagnosisIcon,
  HomeIcon,
  JourneyIcon,
  ProfileIcon,
} from "../../src/components/TabIcons";

export default function Layout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelPosition: "below-icon",
        tabBarHideOnKeyboard: false,
        tabBarActiveTintColor: colors.brown,
        tabBarInactiveTintColor: colors.brown,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.tabItem,
        tabBarStyle: {
          height: 78 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 7),
          borderTopColor: "#ECE7E0",
          backgroundColor: "#FFFFFF",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "홈",
          tabBarIcon: (props) => <HomeIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="ar"
        options={{
          title: "AR",
          tabBarIcon: (props) => <ArIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="diagnosis"
        options={{
          title: "진단",
          tabBarIcon: (props) => <DiagnosisIcon {...props} />,
          tabBarIconStyle: styles.diagnosisTabIcon,
          tabBarLabelStyle: [styles.label, styles.diagnosisLabel],
        }}
      />
      <Tabs.Screen
        name="journey"
        options={{
          title: "여권",
          tabBarIcon: (props) => <JourneyIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "프로필",
          tabBarIcon: (props) => <ProfileIcon {...props} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, marginTop: 4 },
  tabItem: { flex: 1, minWidth: 0 },
  diagnosisTabIcon: { marginTop: -16 },
  diagnosisLabel: { marginTop: 7, transform: [{ translateY: 12 }] },
});
