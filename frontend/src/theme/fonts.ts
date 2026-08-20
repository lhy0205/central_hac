import { cloneElement, type ReactElement } from "react";
import { StyleSheet, Text, TextInput, type TextStyle } from "react-native";

/* 앱 전체 글꼴을 지마켓 산스로 바꾼다.

   화면마다 fontFamily를 일일이 넣는 방법은 쓰지 않았다. 이미 수십 개 StyleSheet에
   fontWeight가 흩어져 있어서 하나씩 손대면 빠뜨리는 곳이 반드시 생긴다. 대신 Text와
   TextInput이 그려질 때 스타일을 한 번 가로채, 그 안의 fontWeight에 맞는 굵기 파일을
   골라 끼운다. 화면 코드는 그대로 두고 결과만 바뀐다.

   fontWeight를 지우고 넘기는 이유는, 굵기 파일을 이미 골라 놨는데 fontWeight까지 남아
   있으면 안드로이드가 그 위에 가짜 굵게를 한 번 더 씌워 글자가 뭉개지기 때문이다. */
export const FONTS = {
  GmarketSansLight: require("../../assets/fonts/GmarketSansLight.otf"),
  GmarketSansMedium: require("../../assets/fonts/GmarketSansMedium.otf"),
  GmarketSansBold: require("../../assets/fonts/GmarketSansBold.otf"),
};

// 지마켓 산스는 Light·Medium·Bold 세 벌뿐이라 나머지 굵기는 가장 가까운 쪽으로 모은다.
function familyFor(weight: TextStyle["fontWeight"]) {
  const value = weight == null ? "400" : String(weight);
  if (value === "100" || value === "200" || value === "300") return "GmarketSansLight";
  if (value === "600" || value === "700" || value === "800" || value === "900" || value === "bold")
    return "GmarketSansBold";
  return "GmarketSansMedium";
}

function patch(style: unknown) {
  const flat = (StyleSheet.flatten(style as TextStyle) ?? {}) as TextStyle;
  // 화면이 직접 fontFamily를 지정했다면 그 뜻을 존중한다.
  if (flat.fontFamily) return style;
  return [style, { fontFamily: familyFor(flat.fontWeight), fontWeight: undefined }];
}

type Renderable = { render?: (...args: unknown[]) => ReactElement<{ style?: unknown }> };

let applied = false;

/* React 19에서 defaultProps는 경고와 함께 무시되므로 render를 감싼다. 앱 시작에 한 번만
   불러야 한다 — 두 번 감싸면 스타일 배열이 매 렌더마다 겹겹이 쌓인다. */
export function applyBrandFont() {
  if (applied) return;
  applied = true;
  for (const component of [Text, TextInput] as unknown as Renderable[]) {
    const original = component.render;
    if (!original) continue;
    component.render = function render(...args: unknown[]) {
      const element = original.apply(this, args);
      return cloneElement(element, { style: patch(element.props.style) });
    };
  }
}
