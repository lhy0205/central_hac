import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/* 홈에서 배경 광고를 위로 스크롤하면 하단 탭바와 내 가방 카드가 통째로 사라져야 한다.
   탭바는 화면이 아니라 탭 네비게이터가 그리기 때문에 화면에서 직접 숨길 수 없어,
   숨김 여부만 컨텍스트로 올려두고 탭바가 그 값을 보고 자기를 접는다. */
type ChromeValue = {
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
};

const ChromeContext = createContext<ChromeValue>({
  tabBarHidden: false,
  setTabBarHidden: () => {},
});

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const value = useMemo(() => ({ tabBarHidden, setTabBarHidden }), [tabBarHidden]);
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome() {
  return useContext(ChromeContext);
}
