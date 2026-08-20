import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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
