import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/* 앱 전체 글꼴(지마켓 산스)을 입히는 자리.

   처음에는 react-native의 Text.render를 감싸 한 번에 갈아끼우려 했는데, RN 0.81의 Text는
   forwardRef가 아니라 그냥 함수 컴포넌트라 render 속성 자체가 없다. 그래서 감싸는 코드가
   아무 일도 하지 않고 조용히 넘어갔다 — 빌드는 되는데 글꼴만 안 바뀌는 상태였다.

   대신 Text와 TextInput을 얇게 감싸 화면들이 이걸 쓰게 한다. 화면 쪽은 import 경로만
   바뀌고 사용법은 그대로다. ref는 React 19에서 평범한 prop이라 전개만 해도 그대로 넘어간다. */

// 지마켓 산스는 Light·Medium·Bold 세 벌뿐이라 나머지 굵기는 가장 가까운 쪽으로 모은다.
function familyFor(weight: TextStyle["fontWeight"]) {
  const value = weight == null ? "400" : String(weight);
  if (value === "100" || value === "200" || value === "300") return "GmarketSansLight";
  if (value === "600" || value === "700" || value === "800" || value === "900" || value === "bold")
    return "GmarketSansBold";
  return "GmarketSansMedium";
}

/* 굵기 파일을 고른 뒤 fontWeight는 지운다. 남겨 두면 안드로이드가 이미 굵은 글꼴 위에
   가짜 굵게를 한 번 더 씌워 글자가 뭉개진다. 화면이 fontFamily를 직접 지정했다면 그대로 둔다. */
function withFont(style: TextProps["style"]) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return style;
  return [style, { fontFamily: familyFor(flat.fontWeight), fontWeight: undefined }];
}

export function Text(props: TextProps) {
  return <RNText {...props} style={withFont(props.style)} />;
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput {...props} style={withFont(props.style)} />;
}
