import { type TextStyle } from "react-native";

/* 앱에서 쓰는 지마켓 산스 세 벌. 실제로 글꼴을 입히는 일은 components/BrandText가 한다.

   처음에는 여기서 react-native의 Text.render를 감싸 한 번에 갈아끼우려 했는데, RN 0.81의
   Text는 forwardRef가 아니라 그냥 함수 컴포넌트라 render 속성 자체가 없었다. 감싸는 코드가
   조용히 아무 일도 하지 않아 빌드는 되는데 글꼴만 안 바뀌었다. 그래서 Text를 얇게 감싸는
   쪽으로 바꿨고, 화면들은 그 래퍼를 import한다 — 빠진 곳이 있으면 grep으로 바로 보인다. */
export const FONTS = {
  GmarketSansLight: require("../../assets/fonts/GmarketSansLight.otf"),
  GmarketSansMedium: require("../../assets/fonts/GmarketSansMedium.otf"),
  GmarketSansBold: require("../../assets/fonts/GmarketSansBold.otf"),
};

export type BrandFontWeight = TextStyle["fontWeight"];
