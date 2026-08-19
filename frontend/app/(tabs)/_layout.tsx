import { Tabs } from "expo-router";

import { TabBarView, TABS, type TabKey } from "../../src/components/BottomTabBar";

// 탭바는 화면 위에 떠 있는 알약 모양이라 기본 tabBar를 쓰지 않는다.
// 그리는 일은 TabBarView가 전담하고(스택 화면의 BottomTabBar와 공유), 여기서는
// 눌린 탭을 네비게이션에 연결만 한다.
export default function Layout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => {
        const current = state.routes[state.index]?.name as TabKey;
        return (
          <TabBarView
            active={TABS.some((tab) => tab.key === current) ? current : "home"}
            onPress={(key) => {
              const route = state.routes.find((item) => item.name === key);
              if (!route) return;
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) navigation.navigate(key);
            }}
          />
        );
      }}
    >
      <Tabs.Screen name="home" options={{ title: "홈" }} />
      <Tabs.Screen name="ar" options={{ title: "AR" }} />
      <Tabs.Screen name="diagnosis" options={{ title: "진단" }} />
      <Tabs.Screen name="journey" options={{ title: "여권" }} />
      <Tabs.Screen name="profile" options={{ title: "프로필" }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
